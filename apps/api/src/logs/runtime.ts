import { spawn } from "node:child_process";
import type { EventEmitter } from "node:events";

type DockerCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type DockerCommandRunner = (args: string[]) => Promise<DockerCommandResult>;

type CreateDockerCommandRunnerOptions = {
  command?: string;
};

type DockerLogsProcess = EventEmitter & {
  kill: (signal?: NodeJS.Signals) => boolean;
  stderr?: EventEmitter | null;
  stdout?: EventEmitter | null;
};

export type ProjectRuntimeLogsReader = (input: {
  projectSlug: string;
  serviceName: string;
  tail: number;
}) => Promise<string[]>;

export type ProjectRuntimeLogsFollowSession = {
  stop: () => void;
};

export type ProjectRuntimeLogsFollower = (input: {
  onError: (error: Error) => void;
  onLine: (line: string) => void;
  projectSlug: string;
  serviceName: string;
}) => ProjectRuntimeLogsFollowSession;

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

const parseLogLines = (stdout: string): string[] => {
  const trimmedOutput = stdout.trim();

  if (trimmedOutput.length === 0) {
    return [];
  }

  return trimmedOutput
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
};

const flushBufferedLogLines = (
  bufferedOutput: string,
  emitLine: (line: string) => void,
): string => {
  const normalizedOutput = bufferedOutput.replace(/\r\n/g, "\n");
  const lines = normalizedOutput.split("\n");
  const trailingLine = lines.pop() ?? "";

  for (const line of lines) {
    const normalizedLine = line.trimEnd();

    if (normalizedLine.length > 0) {
      emitLine(normalizedLine);
    }
  }

  return trailingLine;
};

const flushRemainingLogLine = (
  bufferedOutput: string,
  emitLine: (line: string) => void,
): void => {
  const normalizedLine = bufferedOutput.trimEnd();

  if (normalizedLine.length > 0) {
    emitLine(normalizedLine);
  }
};

const createDockerLogsProcessSpawner = ({
  command = "docker",
}: CreateDockerCommandRunnerOptions = {}): ((
  args: string[],
) => DockerLogsProcess) => {
  return (args) => {
    return spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    }) as DockerLogsProcess;
  };
};

export const createDockerProjectRuntimeLogsReader = ({
  runDockerCommand = createDockerCommandRunner(),
}: {
  runDockerCommand?: DockerCommandRunner;
} = {}): ProjectRuntimeLogsReader => {
  return async ({ projectSlug, serviceName, tail }) => {
    const result = await runDockerCommand([
      "compose",
      "-p",
      projectSlug,
      "logs",
      "--tail",
      String(tail),
      "--no-color",
      serviceName,
    ]);

    if (result.exitCode !== 0) {
      throw new Error("Docker logs lookup failed");
    }

    return parseLogLines(result.stdout);
  };
};

export const createDockerProjectRuntimeLogsFollower = ({
  spawnDockerLogsProcess = createDockerLogsProcessSpawner(),
}: {
  spawnDockerLogsProcess?: (args: string[]) => DockerLogsProcess;
} = {}): ProjectRuntimeLogsFollower => {
  return ({ onError, onLine, projectSlug, serviceName }) => {
    const process = spawnDockerLogsProcess([
      "compose",
      "-p",
      projectSlug,
      "logs",
      "--tail",
      "0",
      "--follow",
      "--no-color",
      serviceName,
    ]);
    let bufferedStdout = "";
    let stopped = false;

    process.stdout?.on("data", (chunk) => {
      bufferedStdout = flushBufferedLogLines(
        appendOutputChunk(bufferedStdout, chunk as Buffer | string),
        onLine,
      );
    });

    const emitSafeError = () => {
      if (stopped) {
        return;
      }

      onError(new Error("Docker logs stream failed"));
    };

    process.on("error", () => {
      emitSafeError();
    });

    process.on("close", (code) => {
      if (stopped) {
        return;
      }

      flushRemainingLogLine(bufferedStdout, onLine);

      if ((code ?? 1) !== 0) {
        emitSafeError();
      }
    });

    return {
      stop() {
        if (stopped) {
          return;
        }

        stopped = true;
        process.kill("SIGTERM");
      },
    };
  };
};
