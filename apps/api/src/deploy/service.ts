import { readFile, writeFile } from "node:fs/promises";

import type { DeploymentDto, DeploymentListDto } from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { decryptEnvContent } from "../env/service.js";
import { appErrors } from "../errors.js";
import type { TelegramNotifierService } from "../notifier/service.js";
import type { ProjectRepository } from "../projects/repository.js";
import type { RuntimePaths } from "../runtime/paths.js";
import {
  type DeployLockService,
  createInMemoryDeployLockService,
} from "./lock.js";
import type { DeployPreflightService } from "./preflight.js";
import type { DeploymentRecord, DeploymentRepository } from "./repository.js";
import {
  type DeployCommandInput,
  type DeployCommandRunner,
  createDeployCommandRunner,
} from "./runner.js";

type CreateDeployServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  deployLockService?: DeployLockService;
  deployTimeoutMs?: number;
  deploymentRepository: DeploymentRepository;
  envEncryptionKey: string;
  logWarning?: (message: string) => void;
  preflightService: DeployPreflightService;
  projectRepository: ProjectRepository;
  runDeployCommand?: DeployCommandRunner;
  telegramNotifierService?: Pick<TelegramNotifierService, "sendMessage">;
  runtimePaths: Pick<
    RuntimePaths,
    "getProjectDeployLogFile" | "getProjectEnvFile"
  >;
};

export type DeployService = {
  deployProject: (input: {
    projectId: string;
    userId: string | null;
  }) => Promise<DeploymentDto>;
  listProjectDeployments: (input: {
    projectId: string;
  }) => Promise<DeploymentListDto>;
};

const parseEnvVariables = (
  content: string,
): {
  secretValues: string[];
  variables: Record<string, string>;
} => {
  const variables: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    variables[key] = value;
  }

  return {
    secretValues: Array.from(
      new Set(
        Object.values(variables).filter((value) => {
          return value.length > 0;
        }),
      ),
    ).sort((left, right) => right.length - left.length),
    variables,
  };
};

const redactSecrets = (input: {
  secretValues: string[];
  text: string;
}): string => {
  return input.secretValues.reduce((current, secretValue) => {
    return current.split(secretValue).join("[REDACTED]");
  }, input.text);
};

const formatDeployLog = (input: {
  args: string[];
  secretValues: string[];
  stderr: string;
  stdout: string;
}): string => {
  const segments = [`$ docker ${input.args.join(" ")}`];

  if (input.stdout.length > 0) {
    segments.push(`[stdout]\n${input.stdout.trimEnd()}`);
  }

  if (input.stderr.length > 0) {
    segments.push(`[stderr]\n${input.stderr.trimEnd()}`);
  }

  return redactSecrets({
    secretValues: input.secretValues,
    text: segments.join("\n"),
  });
};

const normalizeFailureOutput = (
  error: unknown,
): {
  stderr: string;
  stdout: string;
} => {
  if (error instanceof Error) {
    return {
      stderr: error.message,
      stdout: "",
    };
  }

  return {
    stderr: String(error),
    stdout: "",
  };
};

const toDeploymentDto = (record: DeploymentRecord): DeploymentDto => ({
  finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
  id: record.id,
  source: record.source,
  startedAt: record.startedAt.toISOString(),
  status: record.status,
  trigger: record.trigger,
});

const defaultDeployCommandRunner = createDeployCommandRunner();
const defaultWarningLogger = (message: string): void => {
  console.warn(message);
};
const TELEGRAM_DEPLOY_NOTIFICATION_FAILED_WARNING =
  "Telegram deploy notification failed";
const TELEGRAM_NOTIFIER_DISABLED_WARNING =
  "Telegram notifier is not configured";

const toDeploymentSource = (
  sourceType: "git" | "zip",
): DeploymentDto["source"] => {
  return sourceType === "git" ? "git" : "zip";
};

const formatDeployNotificationMessage = (input: {
  deploymentId: string;
  projectSlug: string;
  status: "FAILED" | "SUCCESS";
}): string => {
  return [
    `Deploy ${input.status}`,
    `Project: ${input.projectSlug}`,
    `Deployment: ${input.deploymentId}`,
  ].join("\n");
};

const loadDecryptedEnvVariables = async (input: {
  envEncryptionKey: string;
  envFilePath: string;
}): Promise<{
  secretValues: string[];
  variables: Record<string, string>;
}> => {
  const encryptedContent = await readFile(input.envFilePath, "utf8");
  const content = decryptEnvContent({
    encryptedContent,
    envEncryptionKey: input.envEncryptionKey,
  });

  return parseEnvVariables(content);
};

const writeAuditLogBestEffort = async (input: {
  auditLogRepository: AuditLogRepository | undefined;
  record: Parameters<AuditLogRepository["createAuditLog"]>[0];
}): Promise<void> => {
  if (!input.auditLogRepository) {
    return;
  }

  try {
    await input.auditLogRepository.createAuditLog(input.record);
  } catch {
    // Audit persistence must never change the deploy outcome.
  }
};

const getDeployFinishAuditMessage = (input: {
  exitCode?: number;
  timedOut?: boolean;
}): string => {
  if (input.exitCode === 0) {
    return "Deploy finished successfully";
  }

  if (input.timedOut) {
    return "Deploy failed: timed out";
  }

  return "Deploy failed: command exited non-zero";
};

const sendDeployNotificationBestEffort = async (input: {
  deploymentId: string;
  logWarning: (message: string) => void;
  projectSlug: string;
  status: "FAILED" | "SUCCESS";
  telegramNotifierService:
    | Pick<TelegramNotifierService, "sendMessage">
    | undefined;
}): Promise<void> => {
  if (!input.telegramNotifierService) {
    return;
  }

  try {
    const result = await input.telegramNotifierService.sendMessage({
      text: formatDeployNotificationMessage({
        deploymentId: input.deploymentId,
        projectSlug: input.projectSlug,
        status: input.status,
      }),
    });

    if (result === "disabled") {
      input.logWarning(TELEGRAM_NOTIFIER_DISABLED_WARNING);

      return;
    }

    if (result === "failed") {
      input.logWarning(TELEGRAM_DEPLOY_NOTIFICATION_FAILED_WARNING);
    }
  } catch {
    input.logWarning(TELEGRAM_DEPLOY_NOTIFICATION_FAILED_WARNING);
  }
};

export const createDeployService = ({
  auditLogRepository,
  deployLockService = createInMemoryDeployLockService(),
  deployTimeoutMs = 300000,
  deploymentRepository,
  envEncryptionKey,
  logWarning = defaultWarningLogger,
  preflightService,
  projectRepository,
  runDeployCommand = defaultDeployCommandRunner,
  telegramNotifierService,
  runtimePaths,
}: CreateDeployServiceOptions): DeployService => ({
  async deployProject({ projectId, userId }) {
    const preflight = await preflightService.preflightProjectDeploy({
      projectId,
    });
    const lockHandle = deployLockService.acquire(projectId);

    if (!lockHandle) {
      throw appErrors.conflict(
        "Deployment already in progress for this project",
      );
    }

    try {
      const deployment = await deploymentRepository.createDeployment({
        projectId,
        source: toDeploymentSource(preflight.sourceType),
        status: "RUNNING",
        trigger: "manual",
      });
      await writeAuditLogBestEffort({
        auditLogRepository,
        record: {
          action: "DEPLOY_START",
          entityId: deployment.id,
          entityType: "deployment",
          message: null,
          projectId,
          userId,
        },
      });
      const args = [
        "compose",
        "-p",
        preflight.projectSlug,
        "up",
        "-d",
        "--build",
      ];
      const deployLogPath = runtimePaths.getProjectDeployLogFile(projectId);

      try {
        const envVariables = preflight.hasEncryptedEnv
          ? await loadDecryptedEnvVariables({
              envEncryptionKey,
              envFilePath: runtimePaths.getProjectEnvFile(projectId),
            })
          : {
              secretValues: [],
              variables: {},
            };
        const result = await runDeployCommand({
          args,
          cwd: preflight.workingDir,
          env: {
            ...process.env,
            ...envVariables.variables,
          },
          projectSlug: preflight.projectSlug,
          timeoutMs: deployTimeoutMs,
        });

        await writeFile(
          deployLogPath,
          formatDeployLog({
            args,
            secretValues: envVariables.secretValues,
            stderr: result.stderr,
            stdout: result.stdout,
          }),
          "utf8",
        );

        const deploymentStatus = result.exitCode === 0 ? "SUCCESS" : "FAILED";
        const finishedDeployment = await deploymentRepository.finishDeployment({
          finishedAt: new Date(),
          id: deployment.id,
          status: deploymentStatus,
        });
        await writeAuditLogBestEffort({
          auditLogRepository,
          record: {
            action: "DEPLOY_FINISH",
            entityId: deployment.id,
            entityType: "deployment",
            message: getDeployFinishAuditMessage(result),
            projectId,
            userId,
          },
        });
        await sendDeployNotificationBestEffort({
          deploymentId: finishedDeployment.id,
          logWarning,
          projectSlug: preflight.projectSlug,
          status: deploymentStatus,
          telegramNotifierService,
        });

        return toDeploymentDto(finishedDeployment);
      } catch (error) {
        const failureOutput = normalizeFailureOutput(error);

        await writeFile(
          deployLogPath,
          formatDeployLog({
            args,
            secretValues: [],
            stderr: failureOutput.stderr,
            stdout: failureOutput.stdout,
          }),
          "utf8",
        );

        const failedDeploymentStatus = "FAILED";
        const failedDeployment = await deploymentRepository.finishDeployment({
          finishedAt: new Date(),
          id: deployment.id,
          status: failedDeploymentStatus,
        });
        await writeAuditLogBestEffort({
          auditLogRepository,
          record: {
            action: "DEPLOY_FINISH",
            entityId: deployment.id,
            entityType: "deployment",
            message: "Deploy failed: internal error",
            projectId,
            userId,
          },
        });
        await sendDeployNotificationBestEffort({
          deploymentId: failedDeployment.id,
          logWarning,
          projectSlug: preflight.projectSlug,
          status: failedDeploymentStatus,
          telegramNotifierService,
        });

        return toDeploymentDto(failedDeployment);
      }
    } finally {
      lockHandle.release();
    }
  },
  async listProjectDeployments({ projectId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const deployments =
      await deploymentRepository.listDeploymentsByProject(projectId);

    return deployments.map(toDeploymentDto);
  },
});
