import assert from "node:assert/strict";
import test from "node:test";

import {
  createDockerProjectRuntimeServiceActionRunner,
  createDockerProjectRuntimeServiceLister,
} from "./runtime.js";

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

test("createDockerProjectRuntimeServiceLister parses compose ps output and inspects startedAt values", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: [
        JSON.stringify({
          ID: "container_api",
          Image: "nginx:1.27",
          Name: "demo-api-1",
          Ports: "8080->80/tcp, 8443->443/tcp",
          Service: "api",
          State: "running",
        }),
        JSON.stringify({
          ID: "container_worker",
          Image: "busybox:1.36",
          Name: "demo-worker-1",
          Ports: "",
          Service: "worker",
          State: "restarting",
        }),
        JSON.stringify({
          ID: "container_old",
          Image: "alpine:3.20",
          Name: "demo-old-1",
          Ports: "9000/tcp",
          Service: "old",
          State: "exited",
        }),
        JSON.stringify({
          ID: "container_misc",
          Image: "redis:7",
          Name: "demo-misc-1",
          Ports: "6379/tcp",
          Service: "misc",
          State: "paused",
        }),
      ].join("\n"),
    },
    {
      exitCode: 0,
      stderr: "",
      stdout: [
        '"2026-03-19T15:20:00.000000000Z"',
        '"0001-01-01T00:00:00Z"',
        '"2026-03-19T14:10:00.000000000Z"',
        '"not-a-date"',
      ].join("\n"),
    },
  ]);
  const listProjectRuntimeServices = createDockerProjectRuntimeServiceLister({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await listProjectRuntimeServices({
    projectSlug: "demo-project",
  });

  assert.deepEqual(dockerCommandRunner.calls, [
    ["compose", "-p", "demo-project", "ps", "-a", "--format", "json"],
    [
      "inspect",
      "--format",
      "{{json .State.StartedAt}}",
      "container_api",
      "container_worker",
      "container_old",
      "container_misc",
    ],
  ]);
  assert.deepEqual(result, [
    {
      containerName: "demo-api-1",
      image: "nginx:1.27",
      ports: ["8080->80/tcp", "8443->443/tcp"],
      serviceName: "api",
      startedAt: "2026-03-19T15:20:00.000Z",
      status: "running",
    },
    {
      containerName: "demo-worker-1",
      image: "busybox:1.36",
      ports: [],
      serviceName: "worker",
      startedAt: null,
      status: "starting",
    },
    {
      containerName: "demo-old-1",
      image: "alpine:3.20",
      ports: ["9000/tcp"],
      serviceName: "old",
      startedAt: "2026-03-19T14:10:00.000Z",
      status: "stopped",
    },
    {
      containerName: "demo-misc-1",
      image: "redis:7",
      ports: ["6379/tcp"],
      serviceName: "misc",
      startedAt: null,
      status: "unknown",
    },
  ]);
});

test("createDockerProjectRuntimeServiceLister returns an empty array when docker compose reports no services", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: "",
    },
  ]);
  const listProjectRuntimeServices = createDockerProjectRuntimeServiceLister({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await listProjectRuntimeServices({
    projectSlug: "demo-project",
  });

  assert.deepEqual(result, []);
  assert.deepEqual(dockerCommandRunner.calls, [
    ["compose", "-p", "demo-project", "ps", "-a", "--format", "json"],
  ]);
});

test("createDockerProjectRuntimeServiceLister keeps services and returns null startedAt when inspect fails", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        ID: "container_api",
        Image: "nginx:1.27",
        Name: "demo-api-1",
        Ports: "8080->80/tcp",
        Service: "api",
        State: "running",
      }),
    },
    {
      exitCode: 1,
      stderr: "docker inspect failed",
      stdout: "",
    },
  ]);
  const listProjectRuntimeServices = createDockerProjectRuntimeServiceLister({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await listProjectRuntimeServices({
    projectSlug: "demo-project",
  });

  assert.deepEqual(result, [
    {
      containerName: "demo-api-1",
      image: "nginx:1.27",
      ports: ["8080->80/tcp"],
      serviceName: "api",
      startedAt: null,
      status: "running",
    },
  ]);
});

test("createDockerProjectRuntimeServiceLister throws when docker compose ps exits non-zero", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 1,
      stderr: "compose failed",
      stdout: "",
    },
  ]);
  const listProjectRuntimeServices = createDockerProjectRuntimeServiceLister({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  await assert.rejects(async () => {
    await listProjectRuntimeServices({
      projectSlug: "demo-project",
    });
  });
});

test("createDockerProjectRuntimeServiceActionRunner executes docker compose with the requested action and service name", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: "",
    },
  ]);
  const runProjectServiceAction = createDockerProjectRuntimeServiceActionRunner(
    {
      runDockerCommand: dockerCommandRunner.runDockerCommand,
    },
  );

  await runProjectServiceAction({
    action: "restart",
    projectSlug: "demo-project",
    serviceName: "api",
  });

  assert.deepEqual(dockerCommandRunner.calls, [
    ["compose", "-p", "demo-project", "restart", "api"],
  ]);
});

test("createDockerProjectRuntimeServiceActionRunner throws a safe error when docker compose exits non-zero", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 1,
      stderr: "compose restart leaked internals",
      stdout: "",
    },
  ]);
  const runProjectServiceAction = createDockerProjectRuntimeServiceActionRunner(
    {
      runDockerCommand: dockerCommandRunner.runDockerCommand,
    },
  );

  await assert.rejects(
    async () => {
      await runProjectServiceAction({
        action: "restart",
        projectSlug: "demo-project",
        serviceName: "api",
      });
    },
    (error: unknown) => {
      return (
        error instanceof Error &&
        error.message === "Docker service action failed"
      );
    },
  );
});
