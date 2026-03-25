import { spawn } from "node:child_process";

import {
  type ServiceActionDto,
  type ServiceDto,
  ServiceSchema,
} from "@dockeradmin/shared";

type DockerCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type DockerCommandRunner = (args: string[]) => Promise<DockerCommandResult>;

type ComposePsRecord = {
  ID?: string;
  Image?: string;
  Name?: string;
  Ports?: string;
  Service?: string;
  State?: string;
};

type CreateDockerCommandRunnerOptions = {
  command?: string;
};

export type ProjectRuntimeServiceLister = (input: {
  projectSlug: string;
}) => Promise<ServiceDto[]>;

export type ProjectRuntimeServiceActionRunner = (input: {
  action: ServiceActionDto;
  projectSlug: string;
  serviceName: string;
}) => Promise<void>;

const appendOutputChunk = (current: string, chunk: Buffer | string): string => {
  return current + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
};

const createDockerCommandRunner = ({
  command = "docker",
}: CreateDockerCommandRunnerOptions = {}): DockerCommandRunner => {
  return async (args) => {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (result: DockerCommandResult) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };

      child.stdout?.on("data", (chunk) => {
        stdout = appendOutputChunk(stdout, chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr = appendOutputChunk(stderr, chunk);
      });

      child.on("error", (error) => {
        stderr = appendOutputChunk(stderr, error.message);
        finish({
          exitCode: 1,
          stderr,
          stdout,
        });
      });

      child.on("close", (code) => {
        finish({
          exitCode: code ?? 1,
          stderr,
          stdout,
        });
      });
    });
  };
};

const parseComposePsOutput = (stdout: string): ComposePsRecord[] => {
  const trimmedOutput = stdout.trim();

  if (trimmedOutput.length === 0) {
    return [];
  }

  if (trimmedOutput.startsWith("[")) {
    const parsed = JSON.parse(trimmedOutput);

    return Array.isArray(parsed) ? parsed : [];
  }

  return trimmedOutput
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ComposePsRecord);
};

const normalizePorts = (ports: string | undefined): string[] => {
  if (!ports || ports.trim().length === 0) {
    return [];
  }

  return ports
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const normalizeServiceStatus = (
  state: string | undefined,
): ServiceDto["status"] => {
  switch (state?.toLowerCase()) {
    case "running":
      return "running";
    case "created":
    case "restarting":
      return "starting";
    case "dead":
    case "exited":
    case "removing":
      return "stopped";
    default:
      return "unknown";
  }
};

const normalizeStartedAtLine = (line: string | undefined): string | null => {
  if (!line) {
    return null;
  }

  let parsedLine: unknown;

  try {
    parsedLine = JSON.parse(line);
  } catch {
    parsedLine = line;
  }

  if (typeof parsedLine !== "string" || parsedLine.length === 0) {
    return null;
  }

  if (parsedLine.startsWith("0001-01-01T00:00:00")) {
    return null;
  }

  const date = new Date(parsedLine);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const loadStartedAtByContainerId = async (input: {
  containerIds: string[];
  runDockerCommand: DockerCommandRunner;
}): Promise<Map<string, string>> => {
  if (input.containerIds.length === 0) {
    return new Map();
  }

  const inspectResult = await input.runDockerCommand([
    "inspect",
    "--format",
    "{{json .State.StartedAt}}",
    ...input.containerIds,
  ]);

  if (inspectResult.exitCode !== 0) {
    return new Map();
  }

  const lines = inspectResult.stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  const startedAtByContainerId = new Map<string, string>();

  for (const [index, containerId] of input.containerIds.entries()) {
    const startedAt = normalizeStartedAtLine(lines[index]);

    if (startedAt) {
      startedAtByContainerId.set(containerId, startedAt);
    }
  }

  return startedAtByContainerId;
};

export const createDockerProjectRuntimeServiceLister = ({
  runDockerCommand = createDockerCommandRunner(),
}: {
  runDockerCommand?: DockerCommandRunner;
} = {}): ProjectRuntimeServiceLister => {
  return async ({ projectSlug }) => {
    const composePsResult = await runDockerCommand([
      "compose",
      "-p",
      projectSlug,
      "ps",
      "-a",
      "--format",
      "json",
    ]);

    if (composePsResult.exitCode !== 0) {
      throw new Error("Docker service lookup failed");
    }

    const records = parseComposePsOutput(composePsResult.stdout);
    const containerIds = records
      .map((record) => record.ID)
      .filter((id): id is string => Boolean(id));
    const startedAtByContainerId = await loadStartedAtByContainerId({
      containerIds,
      runDockerCommand,
    });

    return records.map((record) => {
      return ServiceSchema.parse({
        containerName: record.Name ?? "",
        image: record.Image ?? "",
        ports: normalizePorts(record.Ports),
        serviceName: record.Service ?? "",
        startedAt: record.ID
          ? (startedAtByContainerId.get(record.ID) ?? null)
          : null,
        status: normalizeServiceStatus(record.State),
      });
    });
  };
};

export const createDockerProjectRuntimeServiceActionRunner = ({
  runDockerCommand = createDockerCommandRunner(),
}: {
  runDockerCommand?: DockerCommandRunner;
} = {}): ProjectRuntimeServiceActionRunner => {
  return async ({ action, projectSlug, serviceName }) => {
    const result = await runDockerCommand([
      "compose",
      "-p",
      projectSlug,
      action,
      serviceName,
    ]);

    if (result.exitCode !== 0) {
      throw new Error("Docker service action failed");
    }
  };
};
