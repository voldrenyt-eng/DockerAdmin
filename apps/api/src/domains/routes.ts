import {
  mkdir as mkdirDirectory,
  rename as renameFile,
  unlink as unlinkFile,
  writeFile as writeTextFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { DomainRecord, DomainRepository } from "./repository.js";

type EnsureDirectory = (path: string) => Promise<void>;
type RemoveFile = (path: string) => Promise<void>;
type RenameFile = (from: string, to: string) => Promise<void>;
type WriteTextFile = (path: string, content: string) => Promise<void>;

export type TraefikRoutesSyncer = () => Promise<void>;

const DEFAULT_TRAEFIK_ROUTES_FILE_PATH = resolve(
  process.cwd(),
  "infra/traefik/dynamic/routes.yml",
);
const TRAEFIK_TLS_RESOLVER_NAME = "letsencrypt";

const createDomainRouteName = (host: string): string => {
  return `domain-${host.toLowerCase().replace(/\./gu, "-")}`;
};

const sortDomains = (domains: DomainRecord[]): DomainRecord[] => {
  return domains.slice().sort((left, right) => {
    return (
      left.host.localeCompare(right.host) ||
      left.port - right.port ||
      left.id.localeCompare(right.id)
    );
  });
};

export const renderTraefikRoutesFile = (domains: DomainRecord[]): string => {
  const sortedDomains = sortDomains(domains);
  const lines = [
    "http:",
    "  routers:",
    "    api:",
    "      entryPoints:",
    "        - web",
    '      rule: "PathPrefix(`/api`) || Path(`/health`)"',
    "      service: api-service",
    "      priority: 20",
    "",
    "    web:",
    "      entryPoints:",
    "        - web",
    '      rule: "PathPrefix(`/`)"',
    "      service: web-service",
    "      priority: 1",
  ];

  for (const domain of sortedDomains) {
    const routeName = createDomainRouteName(domain.host);

    lines.push(
      "",
      `    ${routeName}:`,
      "      entryPoints:",
      "        - web",
      `      rule: "Host(\`${domain.host}\`)"`,
      `      service: ${routeName}-service`,
      "      priority: 30",
    );

    if (domain.tlsEnabled) {
      lines.push(
        "      tls:",
        `        certResolver: ${TRAEFIK_TLS_RESOLVER_NAME}`,
      );
    }
  }

  lines.push(
    "",
    "  services:",
    "    api-service:",
    "      loadBalancer:",
    "        servers:",
    '          - url: "http://api:3001"',
    "",
    "    web-service:",
    "      loadBalancer:",
    "        servers:",
    '          - url: "http://web:80"',
  );

  for (const domain of sortedDomains) {
    const routeName = createDomainRouteName(domain.host);

    lines.push(
      "",
      `    ${routeName}-service:`,
      "      loadBalancer:",
      "        servers:",
      `          - url: "http://host.docker.internal:${domain.port}"`,
    );
  }

  return `${lines.join("\n")}\n`;
};

export const createTraefikRoutesSyncer = ({
  domainRepository,
  mkdir = async (path) => {
    await mkdirDirectory(path, { recursive: true });
  },
  rename = renameFile,
  routesFilePath = DEFAULT_TRAEFIK_ROUTES_FILE_PATH,
  unlink = async (path) => {
    await unlinkFile(path);
  },
  writeFile = async (path, content) => {
    await writeTextFile(path, content, "utf8");
  },
}: {
  domainRepository: Pick<DomainRepository, "listDomains">;
  mkdir?: EnsureDirectory;
  rename?: RenameFile;
  routesFilePath?: string;
  unlink?: RemoveFile;
  writeFile?: WriteTextFile;
}): TraefikRoutesSyncer => {
  return async () => {
    const domains = await domainRepository.listDomains();
    const content = renderTraefikRoutesFile(domains);
    const targetDirectory = dirname(routesFilePath);
    const tempFilePath = `${routesFilePath}.tmp-${process.pid}-${Date.now()}`;

    await mkdir(targetDirectory);

    try {
      await writeFile(tempFilePath, content);
      await rename(tempFilePath, routesFilePath);
    } catch (error) {
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore temp-file cleanup failures. The original write/rename error is the real signal.
      }

      throw error;
    }
  };
};
