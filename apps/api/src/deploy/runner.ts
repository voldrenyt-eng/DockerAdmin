import { spawn } from "node:child_process";

export type DeployCommandInput = {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  projectSlug: string;
  timeoutMs: number;
};

export type DeployCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
  timedOut?: boolean;
};

export type DeployCommandRunner = (
  input: DeployCommandInput,
) => Promise<DeployCommandResult>;

type CreateDeployCommandRunnerOptions = {
  command?: string;
  killGraceMs?: number;
};

const appendOutputChunk = (current: string, chunk: Buffer | string): string => {
  return current + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
};

const appendOutputLine = (current: string, line: string): string => {
  if (current.length === 0) {
    return `${line}\n`;
  }

  return current.endsWith("\n")
    ? `${current}${line}\n`
    : `${current}\n${line}\n`;
};

export const createDeployCommandRunner = ({
  command = "docker",
  killGraceMs = 1000,
}: CreateDeployCommandRunnerOptions = {}): DeployCommandRunner => {
  return async (input) => {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;

      const child = spawn(command, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (result: DeployCommandResult) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutTimer);

        if (killTimer) {
          clearTimeout(killTimer);
        }

        resolve(result);
      };

      child.stdout?.on("data", (chunk) => {
        stdout = appendOutputChunk(stdout, chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr = appendOutputChunk(stderr, chunk);
      });

      child.on("error", (error) => {
        stderr = appendOutputLine(stderr, error.message);
        finish({
          exitCode: 1,
          stderr,
          stdout,
          timedOut,
        });
      });

      child.on("close", (code, signal) => {
        if (signal && !timedOut) {
          stderr = appendOutputLine(
            stderr,
            `Process exited via signal ${signal}`,
          );
        }

        finish({
          exitCode: timedOut ? 1 : (code ?? 1),
          stderr,
          stdout,
          timedOut,
        });
      });

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        stderr = appendOutputLine(
          stderr,
          `Deploy timed out after ${input.timeoutMs}ms`,
        );
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!settled) {
            child.kill("SIGKILL");
          }
        }, killGraceMs);
      }, input.timeoutMs);
    });
  };
};
