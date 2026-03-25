import { spawn } from "node:child_process";

import {
  type MetricsDto,
  MetricsSchema,
  type ServiceDto,
} from "@dockeradmin/shared";

type DockerCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type DockerCommandRunner = (args: string[]) => Promise<DockerCommandResult>;

type CreateDockerCommandRunnerOptions = {
  command?: string;
};

type DockerStatsRecord = {
  CPUPerc?: string;
  MemUsage?: string;
  NetIO?: string;
};

export type ProjectRuntimeMetricsReader = (input: {
  services: ServiceDto[];
}) => Promise<MetricsDto[]>;

const DECIMAL_SIZE_MULTIPLIERS = new Map<string, number>([
  ["b", 1],
  ["kb", 1_000],
  ["mb", 1_000_000],
  ["gb", 1_000_000_000],
  ["tb", 1_000_000_000_000],
  ["pb", 1_000_000_000_000_000],
]);

const BINARY_SIZE_MULTIPLIERS = new Map<string, number>([
  ["kib", 1024],
  ["mib", 1024 ** 2],
  ["gib", 1024 ** 3],
  ["tib", 1024 ** 4],
  ["pib", 1024 ** 5],
]);

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

const createZeroMetrics = (serviceName: string): MetricsDto => {
  return MetricsSchema.parse({
    cpuPercent: 0,
    memoryLimitBytes: 0,
    memoryUsageBytes: 0,
    networkRxBytes: 0,
    networkTxBytes: 0,
    serviceName,
  });
};

const parsePercent = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.trim().replace(/%$/u, "");
  const parsedValue = Number.parseFloat(normalizedValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue * 100) / 100;
};

const parseSizeToBytes = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.trim().replace(/,/g, "");
  const match = normalizedValue.match(
    /^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)?$/u,
  );

  if (!match) {
    return 0;
  }

  const numericValue = Number.parseFloat(match[1] ?? "");
  const rawUnit = (match[2] ?? "B").toLowerCase();

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  const binaryMultiplier = BINARY_SIZE_MULTIPLIERS.get(rawUnit);

  if (binaryMultiplier) {
    return Math.round(numericValue * binaryMultiplier);
  }

  const decimalMultiplier = DECIMAL_SIZE_MULTIPLIERS.get(rawUnit);

  if (decimalMultiplier) {
    return Math.round(numericValue * decimalMultiplier);
  }

  return 0;
};

const parseUsagePair = (
  value: string | undefined,
): { left: number; right: number } => {
  if (!value) {
    return { left: 0, right: 0 };
  }

  const [left, right] = value.split("/").map((part) => part.trim());

  return {
    left: parseSizeToBytes(left),
    right: parseSizeToBytes(right),
  };
};

const parseStatsRecord = (stdout: string): DockerStatsRecord | null => {
  const firstLine = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(firstLine) as DockerStatsRecord;

    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const readMetricsForService = async (input: {
  runDockerCommand: DockerCommandRunner;
  service: ServiceDto;
}): Promise<MetricsDto> => {
  if (
    input.service.status !== "running" ||
    input.service.containerName.trim().length === 0
  ) {
    return createZeroMetrics(input.service.serviceName);
  }

  const result = await input.runDockerCommand([
    "stats",
    "--no-stream",
    "--format",
    "{{ json . }}",
    input.service.containerName,
  ]);

  if (result.exitCode !== 0) {
    return createZeroMetrics(input.service.serviceName);
  }

  const statsRecord = parseStatsRecord(result.stdout);

  if (!statsRecord) {
    return createZeroMetrics(input.service.serviceName);
  }

  const memory = parseUsagePair(statsRecord.MemUsage);
  const network = parseUsagePair(statsRecord.NetIO);

  return MetricsSchema.parse({
    cpuPercent: parsePercent(statsRecord.CPUPerc),
    memoryLimitBytes: memory.right,
    memoryUsageBytes: memory.left,
    networkRxBytes: network.left,
    networkTxBytes: network.right,
    serviceName: input.service.serviceName,
  });
};

export const createDockerProjectRuntimeMetricsReader = ({
  runDockerCommand = createDockerCommandRunner(),
}: {
  runDockerCommand?: DockerCommandRunner;
} = {}): ProjectRuntimeMetricsReader => {
  return async ({ services }) => {
    return await Promise.all(
      services.map(async (service) => {
        return await readMetricsForService({
          runDockerCommand,
          service,
        });
      }),
    );
  };
};
