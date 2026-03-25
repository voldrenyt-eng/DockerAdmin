import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createDockerProjectRuntimeLogsFollower,
  createDockerProjectRuntimeLogsReader,
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

test("createDockerProjectRuntimeLogsReader returns the last log lines for a project service", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: ["demo-api-1  | starting", "demo-api-1  | ready"].join("\n"),
    },
  ]);
  const readProjectRuntimeLogs = createDockerProjectRuntimeLogsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await readProjectRuntimeLogs({
    projectSlug: "demo-project",
    serviceName: "api",
    tail: 50,
  });

  assert.deepEqual(dockerCommandRunner.calls, [
    [
      "compose",
      "-p",
      "demo-project",
      "logs",
      "--tail",
      "50",
      "--no-color",
      "api",
    ],
  ]);
  assert.deepEqual(result, ["demo-api-1  | starting", "demo-api-1  | ready"]);
});

test("createDockerProjectRuntimeLogsReader returns an empty array when docker compose logs returns no output", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 0,
      stderr: "",
      stdout: "",
    },
  ]);
  const readProjectRuntimeLogs = createDockerProjectRuntimeLogsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  const result = await readProjectRuntimeLogs({
    projectSlug: "demo-project",
    serviceName: "api",
    tail: 20,
  });

  assert.deepEqual(result, []);
});

test("createDockerProjectRuntimeLogsReader throws a safe error when docker compose logs exits non-zero", async () => {
  const dockerCommandRunner = createDockerCommandRunnerDouble([
    {
      exitCode: 1,
      stderr: "docker compose logs leaked internals",
      stdout: "",
    },
  ]);
  const readProjectRuntimeLogs = createDockerProjectRuntimeLogsReader({
    runDockerCommand: dockerCommandRunner.runDockerCommand,
  });

  await assert.rejects(
    async () => {
      await readProjectRuntimeLogs({
        projectSlug: "demo-project",
        serviceName: "api",
        tail: 20,
      });
    },
    (error: unknown) => {
      return (
        error instanceof Error && error.message === "Docker logs lookup failed"
      );
    },
  );
});

const createDockerLogsProcessDouble = () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const process = new EventEmitter() as EventEmitter & {
    kill: (signal?: NodeJS.Signals) => boolean;
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  const killCalls: Array<NodeJS.Signals | undefined> = [];

  process.stdout = stdout;
  process.stderr = stderr;
  process.kill = (signal) => {
    killCalls.push(signal);

    return true;
  };

  return {
    killCalls,
    process,
    stderr,
    stdout,
  };
};

test("createDockerProjectRuntimeLogsFollower follows live docker compose logs and stops the child process on disconnect", async () => {
  const dockerLogsProcess = createDockerLogsProcessDouble();
  const calls: string[][] = [];
  const followProjectRuntimeLogs = createDockerProjectRuntimeLogsFollower({
    spawnDockerLogsProcess: (args) => {
      calls.push(args);

      return dockerLogsProcess.process;
    },
  });
  const seenLines: string[] = [];
  const seenErrors: Error[] = [];

  const session = followProjectRuntimeLogs({
    onError: (error) => {
      seenErrors.push(error);
    },
    onLine: (line) => {
      seenLines.push(line);
    },
    projectSlug: "demo-project",
    serviceName: "api",
  });

  dockerLogsProcess.stdout.emit("data", "demo-api-1  | sta");
  dockerLogsProcess.stdout.emit("data", "rting\n");
  dockerLogsProcess.stdout.emit("data", "demo-api-1  | ready\n");

  assert.deepEqual(calls, [
    [
      "compose",
      "-p",
      "demo-project",
      "logs",
      "--tail",
      "0",
      "--follow",
      "--no-color",
      "api",
    ],
  ]);
  assert.deepEqual(seenLines, [
    "demo-api-1  | starting",
    "demo-api-1  | ready",
  ]);
  assert.deepEqual(seenErrors, []);

  session.stop();
  dockerLogsProcess.process.emit("close", 1);

  assert.deepEqual(dockerLogsProcess.killCalls, ["SIGTERM"]);
  assert.deepEqual(seenErrors, []);
});

test("createDockerProjectRuntimeLogsFollower reports a safe error when docker compose follow exits non-zero", async () => {
  const dockerLogsProcess = createDockerLogsProcessDouble();
  const followProjectRuntimeLogs = createDockerProjectRuntimeLogsFollower({
    spawnDockerLogsProcess: () => {
      return dockerLogsProcess.process;
    },
  });
  const seenErrors: Error[] = [];

  followProjectRuntimeLogs({
    onError: (error) => {
      seenErrors.push(error);
    },
    onLine: () => {},
    projectSlug: "demo-project",
    serviceName: "api",
  });
  dockerLogsProcess.stderr.emit(
    "data",
    "docker compose follow leaked internals",
  );
  dockerLogsProcess.process.emit("close", 1);

  assert.equal(seenErrors.length, 1);
  assert.equal(seenErrors[0]?.message, "Docker logs stream failed");
});
