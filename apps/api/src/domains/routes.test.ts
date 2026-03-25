import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { type DomainRecord, createDomainRepository } from "./repository.js";

const createDomainRecord = (
  overrides: Partial<DomainRecord> = {},
): DomainRecord => ({
  createdAt: new Date("2026-03-20T12:00:00.000Z"),
  host: "app.example.com",
  id: "domain_1",
  port: 8080,
  projectId: "project_1",
  serviceName: "api",
  tlsEnabled: false,
  updatedAt: new Date("2026-03-20T12:00:00.000Z"),
  ...overrides,
});

test("renderTraefikRoutesFile renders base routes and host routes from a full domain snapshot", async () => {
  const routesModule = await import("./routes.js").catch(() => null);

  assert.notEqual(routesModule, null);

  if (!routesModule) {
    return;
  }

  const content = routesModule.renderTraefikRoutesFile([
    createDomainRecord({
      host: "admin.example.com",
      id: "domain_2",
      port: 9001,
      serviceName: "admin",
    }),
    createDomainRecord(),
  ]);

  assert.match(
    content,
    /rule: "PathPrefix\(`\/api`\) \|\| Path\(`\/health`\)"/,
  );
  assert.match(content, /rule: "PathPrefix\(`\/`\)"/);
  assert.match(content, /domain-admin-example-com:/);
  assert.match(content, /rule: "Host\(`admin\.example\.com`\)"/);
  assert.match(content, /domain-admin-example-com-service:/);
  assert.match(content, /url: "http:\/\/host\.docker\.internal:9001"/);
  assert.match(content, /domain-app-example-com:/);
  assert.match(content, /url: "http:\/\/host\.docker\.internal:8080"/);
  assert.ok(
    content.indexOf("domain-admin-example-com:") <
      content.indexOf("domain-app-example-com:"),
  );
});

test("renderTraefikRoutesFile adds a TLS resolver only for tlsEnabled domains", async () => {
  const routesModule = await import("./routes.js").catch(() => null);

  assert.notEqual(routesModule, null);

  if (!routesModule) {
    return;
  }

  const content = routesModule.renderTraefikRoutesFile([
    createDomainRecord({
      host: "secure.example.com",
      id: "domain_2",
      port: 9443,
      tlsEnabled: true,
    }),
    createDomainRecord({
      host: "plain.example.com",
      id: "domain_3",
      port: 9080,
      tlsEnabled: false,
    }),
  ]);
  const secureRouteBlock =
    content.match(
      /domain-secure-example-com:[\s\S]*?(?=\n\n {4}domain-|\n\n {2}services:)/,
    )?.[0] ?? "";
  const plainRouteBlock =
    content.match(
      /domain-plain-example-com:[\s\S]*?(?=\n\n {4}domain-|\n\n {2}services:)/,
    )?.[0] ?? "";

  assert.match(secureRouteBlock, /tls:[\s\S]*certResolver: letsencrypt/);
  assert.doesNotMatch(plainRouteBlock, /tls:[\s\S]*certResolver: letsencrypt/);
});

test("createTraefikRoutesSyncer writes through a temp file and atomically renames it into place", async () => {
  const routesModule = await import("./routes.js").catch(() => null);

  assert.notEqual(routesModule, null);

  if (!routesModule) {
    return;
  }

  const mkdirCalls: string[] = [];
  const renameCalls: Array<{ from: string; to: string }> = [];
  const writeCalls: Array<{ content: string; path: string }> = [];
  const routesFilePath = "/tmp/dockeradmin-traefik/routes.yml";
  const domainRepository = createDomainRepository({
    domains: [createDomainRecord()],
  });
  const syncRoutes = routesModule.createTraefikRoutesSyncer({
    domainRepository,
    mkdir: async (path: string) => {
      mkdirCalls.push(path);
    },
    rename: async (from: string, to: string) => {
      renameCalls.push({ from, to });
    },
    routesFilePath,
    writeFile: async (path: string, content: string) => {
      writeCalls.push({ content, path });
    },
  });

  await syncRoutes();

  assert.deepEqual(mkdirCalls, ["/tmp/dockeradmin-traefik"]);
  assert.equal(writeCalls.length, 1);
  assert.match(writeCalls[0]?.path ?? "", /routes\.yml\.tmp-/);
  assert.match(writeCalls[0]?.content ?? "", /app\.example\.com/);
  assert.deepEqual(renameCalls, [
    {
      from: writeCalls[0]?.path ?? "",
      to: routesFilePath,
    },
  ]);
});

test("createTraefikRoutesSyncer rewrites routes.yml from the full DB snapshot instead of appending stale entries", async () => {
  const routesModule = await import("./routes.js").catch(() => null);

  assert.notEqual(routesModule, null);

  if (!routesModule) {
    return;
  }

  const rootDir = mkdtempSync(join(tmpdir(), "dockeradmin-traefik-routes-"));
  const routesFilePath = join(rootDir, "routes.yml");

  writeFileSync(routesFilePath, "stale.example.com\n", "utf8");

  const domainRepository = createDomainRepository({
    domains: [
      createDomainRecord({
        host: "fresh.example.com",
        id: "domain_2",
        port: 9010,
      }),
    ],
  });
  const syncRoutes = routesModule.createTraefikRoutesSyncer({
    domainRepository,
    routesFilePath,
  });

  try {
    await syncRoutes();

    const content = readFileSync(routesFilePath, "utf8");

    assert.match(content, /fresh\.example\.com/);
    assert.doesNotMatch(content, /stale\.example\.com/);
    assert.deepEqual(
      readdirSync(rootDir).filter((entry) => entry.includes(".tmp-")),
      [],
    );
  } finally {
    rmSync(rootDir, { force: true, recursive: true });
  }
});
