import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDto } from "@dockeradmin/shared";

import { createDockerProjectRuntimeMetricsReader } from "./runtime.js";

const createServiceFixture = (
  overrides: Partial<ServiceDto> = {},
): ServiceDto => ({
  containerName: "demo-api-1",
  image: "nginx:1.27",
  ports: ["8080->80/tcp"],
  serviceName: "api",
  startedAt: "2026-03-20T10:00:00.000Z",
  status: "running",
  ...overrides,
});

const createDockerCommandRunnerDouble = (
  results: Array<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }>,
) => {
  const calls: string[][] = [];

  return {
    calls,
    runDockerCommand: async (args: string[]) => {
      calls.push(args);

      const result = results.shift();

      if (!result) {
        throw new Error(`Unexpected docker command: ${args.join(" ")}`);
      }

      return result;
    },
  };
};

test("createDockerProjectRuntimeMetricsReader parses running container stats and zero-fills stopped or failed services", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        CPUPerc: "12.5%",
        MemUsage: "12.5MiB / 1.5GiB",
        NetIO: "1.5kB / 2MiB",
      }),
    },
    {
      exitCode: 1,
      stderr: "docker stats failed",
      stdout: "",
    },
  ]);
  const readProjectRuntimeMetrics = createDockerProjectRuntimeMetricsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await readProjectRuntimeMetrics({
    services: [
      createServiceFixture(),
      createServiceFixture({
        containerName: "demo-worker-1",
        serviceName: "worker",
        status: "stopped",
      }),
      createServiceFixture({
        containerName: "demo-web-1",
        serviceName: "web",
      }),
    ],
  });

  assert.deepEqual(dockerCommandRunner.calls, [
    ["stats", "--no-stream", "--format", "{{ json . }}", "demo-api-1"],
    ["stats", "--no-stream", "--format", "{{ json . }}", "demo-web-1"],
  ]);
  assert.deepEqual(result, [
    {
      cpuPercent: 12.5,
      memoryLimitBytes: 1610612736,
      memoryUsageBytes: 13107200,
      networkRxBytes: 1500,
      networkTxBytes: 2097152,
      serviceName: "api",
    },
    {
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "worker",
    },
    {
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "web",
    },
  ]);
});

test("createDockerProjectRuntimeMetricsReader returns zero metrics when docker stats output is malformed", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: "not-json",
    },
  ]);
  const readProjectRuntimeMetrics = createDockerProjectRuntimeMetricsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await readProjectRuntimeMetrics({
    services: [createServiceFixture()],
  });

  assert.deepEqual(result, [
    {
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "api",
    },
  ]);
});

test("createDockerProjectRuntimeMetricsReader normalizes cpu precision and byte units into stable numeric values", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        CPUPerc: "12.3456%",
        MemUsage: "1.49kB / 2.49MB",
        NetIO: "512B / 1.5GiB",
      }),
    },
  ]);
  const readProjectRuntimeMetrics = createDockerProjectRuntimeMetricsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await readProjectRuntimeMetrics({
    services: [createServiceFixture()],
  });

  assert.deepEqual(result, [
    {
      cpuPercent: 12.35,
      memoryLimitBytes: 2490000,
      memoryUsageBytes: 1490,
      networkRxBytes: 512,
      networkTxBytes: 1610612736,
      serviceName: "api",
    },
  ]);
});
