import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthSchema, DeploymentSchema } from "@dockeradmin/shared";

import { hashPassword } from "../auth/password.js";
import { createAuthRepository } from "../auth/repository.js";
import { createAuthService } from "../auth/service.js";
import { encryptEnvContent } from "../env/service.js";
import type {
  TelegramNotifierSendResult,
  TelegramNotifierService,
} from "../notifier/service.js";
import {
  type ProjectRecord,
  createProjectRepository,
} from "../projects/repository.js";
import { createRuntimePaths } from "../runtime/paths.js";
import { buildApp } from "../server.js";
import { createDeployPreflightService } from "./preflight.js";
import {
  type DeploymentRecord,
  createDeploymentRepository,
} from "./repository.js";
import type { DeployCommandInput } from "./runner.js";
import { createDeployService } from "./service.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";
const ENV_ENCRYPTION_KEY = "test-env-encryption-key";

type AuditLogRecord = {
  action: string;
  entityId: string | null;
  entityType: string;
  message: string | null;
  projectId: string | null;
  userId: string | null;
};

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

const createProjectRecord = (
  sourceType: ProjectRecord["sourceType"],
): ProjectRecord => ({
  createdAt: new Date("2026-03-19T11:00:00.000Z"),
  id: `project_${sourceType}`,
  name: `Project ${sourceType}`,
  slug: `project-${sourceType}`,
  sourceType,
  updatedAt: new Date("2026-03-19T11:00:00.000Z"),
});

const createAuditLogRepository = () => {
  const records: AuditLogRecord[] = [];

  return {
    createAuditLog: async (input: AuditLogRecord) => {
      records.push({
        ...input,
      });
    },
    listAuditLogs: () => {
      return records.map((record) => ({
        ...record,
      }));
    },
  };
};

const createTelegramNotifierCapture = () => {
  const messages: string[] = [];
  let nextResult: TelegramNotifierSendResult = "sent";

  return {
    notifierService: {
      isConfigured: () => nextResult !== "disabled",
      sendMessage: async ({ text }) => {
        messages.push(text);

        return nextResult;
      },
    } satisfies TelegramNotifierService,
    listMessages: () => {
      return [...messages];
    },
    setNextResult: (value: TelegramNotifierSendResult) => {
      nextResult = value;
    },
  };
};

const createDeployEndpointContext = async (project?: ProjectRecord) => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-deploy-"));
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const authRepository = createAuthRepository({
    refreshTokens: [],
    users: [
      {
        email: ADMIN_EMAIL,
        id: "user_admin",
        passwordHash,
        role: "ADMIN",
      },
    ],
  });
  const authService = createAuthService({
    authRepository,
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
  });
  const runtimePaths = createRuntimePaths({ dataRoot });
  const projectRepository = createProjectRepository(
    project ? { projects: [project] } : {},
  );
  const deploymentRepository = createDeploymentRepository();
  const auditLogRepository = createAuditLogRepository();
  const executedCommands: DeployCommandInput[] = [];
  const preflightService = createDeployPreflightService({
    checkDockerDaemon: async () => undefined,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
    projectRepository,
    runtimePaths,
  });
  let nextCommandResult = {
    exitCode: 0,
    stderr: "",
    stdout: "",
  };
  let nextHeldCommand:
    | {
        release: ReturnType<typeof createDeferred>;
        started: ReturnType<typeof createDeferred>;
      }
    | undefined;
  const deployService = createDeployService({
    auditLogRepository,
    deploymentRepository,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
    preflightService,
    projectRepository,
    runDeployCommand: async (input: DeployCommandInput) => {
      executedCommands.push(input);
      const heldCommand = nextHeldCommand;

      if (heldCommand) {
        nextHeldCommand = undefined;
        heldCommand.started.resolve();
        await heldCommand.release.promise;
      }

      return nextCommandResult;
    },
    runtimePaths,
  } as never);
  const app = buildApp({
    authService,
    deployService,
  } as never);

  return {
    app,
    auditLogRepository,
    dataRoot,
    deploymentRepository,
    executedCommands,
    holdNextCommandOpen: () => {
      const heldCommand = {
        release: createDeferred(),
        started: createDeferred(),
      };
      nextHeldCommand = heldCommand;

      return {
        release: () => {
          heldCommand.release.resolve();
        },
        waitUntilStarted: () => heldCommand.started.promise,
      };
    },
    runtimePaths,
    setNextCommandResult: (value: typeof nextCommandResult) => {
      nextCommandResult = value;
    },
  };
};

const createCustomDeployEndpointContext = async (input: {
  deployTimeoutMs: number;
  deployments?: DeploymentRecord[];
  logWarning?: (message: string) => void;
  project?: ProjectRecord;
  runDeployCommand: (command: DeployCommandInput) => Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
    timedOut?: boolean;
  }>;
  telegramNotifierService?: TelegramNotifierService;
}) => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-deploy-custom-"));
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const authRepository = createAuthRepository({
    refreshTokens: [],
    users: [
      {
        email: ADMIN_EMAIL,
        id: "user_admin",
        passwordHash,
        role: "ADMIN",
      },
    ],
  });
  const authService = createAuthService({
    authRepository,
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
  });
  const runtimePaths = createRuntimePaths({ dataRoot });
  const projectRepository = createProjectRepository(
    input.project ? { projects: [input.project] } : {},
  );
  const deploymentRepository = createDeploymentRepository(
    input.deployments ? { deployments: input.deployments } : {},
  );
  const auditLogRepository = createAuditLogRepository();
  const preflightService = createDeployPreflightService({
    checkDockerDaemon: async () => undefined,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
    projectRepository,
    runtimePaths,
  });
  const app = buildApp({
    authService,
    deployService: createDeployService({
      auditLogRepository,
      deploymentRepository,
      deployTimeoutMs: input.deployTimeoutMs,
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      logWarning: input.logWarning,
      preflightService,
      projectRepository,
      runDeployCommand: input.runDeployCommand,
      telegramNotifierService: input.telegramNotifierService,
      runtimePaths,
    } as never),
  } as never);

  return {
    app,
    auditLogRepository,
    dataRoot,
    deploymentRepository,
    runtimePaths,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createDeployEndpointContext>>["app"],
): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    payload: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    url: "/api/auth/login",
  });

  return AuthSchema.parse(response.json()).tokens.accessToken;
};

test("GET /api/projects/:id/deployments returns newest-first deployment history for an authenticated admin", async () => {
  const project = createProjectRecord("git");
  const context = await createCustomDeployEndpointContext({
    deployments: [
      {
        createdAt: new Date("2026-03-19T12:00:00.000Z"),
        finishedAt: new Date("2026-03-19T12:01:00.000Z"),
        id: "deployment_1",
        projectId: project.id,
        source: "zip",
        startedAt: new Date("2026-03-19T12:00:00.000Z"),
        status: "SUCCESS",
        trigger: "manual",
        updatedAt: new Date("2026-03-19T12:01:00.000Z"),
      },
      {
        createdAt: new Date("2026-03-19T12:05:00.000Z"),
        finishedAt: new Date("2026-03-19T12:06:00.000Z"),
        id: "deployment_2",
        projectId: project.id,
        source: "git",
        startedAt: new Date("2026-03-19T12:05:00.000Z"),
        status: "FAILED",
        trigger: "manual",
        updatedAt: new Date("2026-03-19T12:06:00.000Z"),
      },
    ],
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
  });

  try {
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${project.id}/deployments`,
    });

    assert.equal(response.statusCode, 200);

    const payload = (response.json() as unknown[]).map((entry) =>
      DeploymentSchema.parse(entry),
    );

    assert.deepEqual(
      payload.map((entry) => entry.id),
      ["deployment_2", "deployment_1"],
    );
    assert.deepEqual(
      payload.map((entry) => entry.status),
      ["FAILED", "SUCCESS"],
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy sends a safe SUCCESS Telegram notification after a successful deploy", async () => {
  const project = createProjectRecord("zip");
  const notifier = createTelegramNotifierCapture();
  const warnings: string[] = [];
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    logWarning: (message) => {
      warnings.push(message);
    },
    project,
    runDeployCommand: async () => {
      return {
        exitCode: 0,
        stderr: "",
        stdout: "compose up complete\n",
      };
    },
    telegramNotifierService: notifier.notifierService,
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const deployment = DeploymentSchema.parse(response.json());
    const messages = notifier.listMessages();

    assert.equal(deployment.status, "SUCCESS");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.includes("Deploy SUCCESS"), true);
    assert.equal(messages[0]?.includes(project.slug), true);
    assert.equal(messages[0]?.includes(deployment.id), true);
    assert.deepEqual(warnings, []);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy sends a safe FAILED Telegram notification after a failed deploy", async () => {
  const project = createProjectRecord("git");
  const notifier = createTelegramNotifierCapture();
  const warnings: string[] = [];
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    logWarning: (message) => {
      warnings.push(message);
    },
    project,
    runDeployCommand: async () => {
      return {
        exitCode: 1,
        stderr: "compose failed: password=super-secret\n",
        stdout: "",
      };
    },
    telegramNotifierService: notifier.notifierService,
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const deployment = DeploymentSchema.parse(response.json());
    const messages = notifier.listMessages();

    assert.equal(deployment.status, "FAILED");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.includes("Deploy FAILED"), true);
    assert.equal(messages[0]?.includes(project.slug), true);
    assert.equal(messages[0]?.includes(deployment.id), true);
    assert.equal(messages[0]?.includes("super-secret"), false);
    assert.deepEqual(warnings, []);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy keeps the deploy result when Telegram is not configured and logs a safe warning", async () => {
  const project = createProjectRecord("zip");
  const notifier = createTelegramNotifierCapture();
  const warnings: string[] = [];
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    logWarning: (message) => {
      warnings.push(message);
    },
    project,
    runDeployCommand: async () => {
      return {
        exitCode: 0,
        stderr: "",
        stdout: "compose up complete\n",
      };
    },
    telegramNotifierService: notifier.notifierService,
  });
  notifier.setNextResult("disabled");

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const deployment = DeploymentSchema.parse(response.json());

    assert.equal(deployment.status, "SUCCESS");
    assert.deepEqual(warnings, ["Telegram notifier is not configured"]);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy writes DEPLOY_START and DEPLOY_FINISH audit records for a successful manual deploy", async () => {
  const project = createProjectRecord("zip");
  const context = await createDeployEndpointContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const deployment = DeploymentSchema.parse(response.json());
    const auditLogs = context.auditLogRepository.listAuditLogs();

    assert.equal(auditLogs.length, 2);
    assert.deepEqual(
      auditLogs.map((record) => record.action),
      ["DEPLOY_START", "DEPLOY_FINISH"],
    );
    assert.equal(auditLogs[0]?.entityType, "deployment");
    assert.equal(auditLogs[0]?.entityId, deployment.id);
    assert.equal(auditLogs[0]?.projectId, project.id);
    assert.equal(auditLogs[0]?.userId, "user_admin");
    assert.equal(auditLogs[1]?.message, "Deploy finished successfully");
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy writes a safe timeout finish reason without leaking partial output into audit", async () => {
  const project = createProjectRecord("git");
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => {
      return {
        exitCode: 1,
        stderr: "Deploy timed out after 25ms\nsecret-timeout-value\n",
        timedOut: true,
        stdout: "partial stdout before timeout\nsecret-timeout-value\n",
      };
    },
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const auditLogs = context.auditLogRepository.listAuditLogs();
    const finishAudit = auditLogs[1];

    assert.equal(auditLogs.length, 2);
    assert.equal(finishAudit?.action, "DEPLOY_FINISH");
    assert.equal(finishAudit?.message, "Deploy failed: timed out");
    assert.equal(finishAudit?.message?.includes("partial stdout"), false);
    assert.equal(finishAudit?.message?.includes("secret-timeout-value"), false);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy writes a safe non-zero finish reason for a failed deploy", async () => {
  const project = createProjectRecord("zip");
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => {
      return {
        exitCode: 1,
        stderr: "compose failed: password=super-secret\n",
        stdout: "",
      };
    },
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const auditLogs = context.auditLogRepository.listAuditLogs();

    assert.equal(auditLogs.length, 2);
    assert.equal(auditLogs[1]?.action, "DEPLOY_FINISH");
    assert.equal(
      auditLogs[1]?.message,
      "Deploy failed: command exited non-zero",
    );
    assert.equal(auditLogs[1]?.message?.includes("super-secret"), false);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy does not write audit records when the project is missing", async () => {
  const context = await createDeployEndpointContext();

  try {
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: "/api/projects/project_missing/deploy",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(context.auditLogRepository.listAuditLogs(), []);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy does not write audit records when the access token is missing", async () => {
  const project = createProjectRecord("zip");
  const context = await createDeployEndpointContext(project);

  try {
    const response = await context.app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(context.auditLogRepository.listAuditLogs(), []);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects/:id/deployments returns an empty array when the project exists and has no deployments", async () => {
  const project = createProjectRecord("zip");
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
  });

  try {
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${project.id}/deployments`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects/:id/deployments returns a standardized 404 when the project is missing", async () => {
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    runDeployCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
  });

  try {
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_missing/deployments",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects/:id/deployments returns a standardized 401 when the access token is missing", async () => {
  const project = createProjectRecord("zip");
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
  });

  try {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/deployments`,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy returns a successful deployment record, writes a redacted log, and executes docker compose in the project working dir", async () => {
  const project = createProjectRecord("zip");
  const context = await createDeployEndpointContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    writeFileSync(
      context.runtimePaths.getProjectEnvFile(project.id),
      encryptEnvContent({
        content:
          "TOKEN=secret-value\nDATABASE_URL=postgres://user:pass@db/app\n",
        envEncryptionKey: ENV_ENCRYPTION_KEY,
      }),
      "utf8",
    );
    context.setNextCommandResult({
      exitCode: 0,
      stderr: "stderr: postgres://user:pass@db/app\n",
      stdout: "stdout: secret-value\n",
    });
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const payload = DeploymentSchema.parse(response.json());

    assert.equal(payload.status, "SUCCESS");
    assert.equal(payload.source, "zip");
    assert.equal(payload.trigger, "manual");
    assert.notEqual(payload.finishedAt, null);
    assert.equal(context.executedCommands.length, 1);
    assert.deepEqual(context.executedCommands[0]?.args, [
      "compose",
      "-p",
      project.slug,
      "up",
      "-d",
      "--build",
    ]);
    assert.equal(
      context.executedCommands[0]?.cwd,
      context.runtimePaths.getProjectSrcDir(project.id),
    );
    assert.equal(context.executedCommands[0]?.env.TOKEN, "secret-value");
    assert.equal(
      context.executedCommands[0]?.env.DATABASE_URL,
      "postgres://user:pass@db/app",
    );

    const deployLog = readFileSync(
      context.runtimePaths.getProjectDeployLogFile(project.id),
      "utf8",
    );

    assert.equal(deployLog.includes("secret-value"), false);
    assert.equal(deployLog.includes("postgres://user:pass@db/app"), false);
    assert.equal(deployLog.includes("[REDACTED]"), true);

    const savedDeployments =
      await context.deploymentRepository.listDeploymentsByProject(project.id);

    assert.equal(savedDeployments.length, 1);
    assert.equal(savedDeployments[0]?.status, "SUCCESS");
    assert.notEqual(savedDeployments[0]?.finishedAt, null);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy returns a failed deployment record when docker compose exits non-zero", async () => {
  const project = createProjectRecord("git");
  const context = await createDeployEndpointContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    context.setNextCommandResult({
      exitCode: 1,
      stderr: "compose failed\n",
      stdout: "",
    });
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);

    const payload = DeploymentSchema.parse(response.json());

    assert.equal(payload.status, "FAILED");
    assert.equal(payload.source, "git");
    assert.notEqual(payload.finishedAt, null);

    const savedDeployments =
      await context.deploymentRepository.listDeploymentsByProject(project.id);

    assert.equal(savedDeployments.length, 1);
    assert.equal(savedDeployments[0]?.status, "FAILED");
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy returns a standardized 409 when another deploy for the same project is already running and releases the lock after success", async () => {
  const project = createProjectRecord("zip");
  const context = await createDeployEndpointContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);
    const heldCommand = context.holdNextCommandOpen();
    const firstDeployPromise = context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    await heldCommand.waitUntilStarted();

    const secondResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(secondResponse.statusCode, 409);
    assert.deepEqual(secondResponse.json(), {
      error: {
        code: "CONFLICT",
        message: "Deployment already in progress for this project",
      },
    });

    heldCommand.release();

    const firstResponse = await firstDeployPromise;

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(
      DeploymentSchema.parse(firstResponse.json()).status,
      "SUCCESS",
    );

    const thirdResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(thirdResponse.statusCode, 200);
    assert.equal(
      DeploymentSchema.parse(thirdResponse.json()).status,
      "SUCCESS",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy releases the project lock after a failed deployment", async () => {
  const project = createProjectRecord("git");
  const context = await createDeployEndpointContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);
    context.setNextCommandResult({
      exitCode: 1,
      stderr: "compose failed\n",
      stdout: "",
    });

    const firstResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(DeploymentSchema.parse(firstResponse.json()).status, "FAILED");

    context.setNextCommandResult({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });

    const secondResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(secondResponse.statusCode, 200);
    assert.equal(
      DeploymentSchema.parse(secondResponse.json()).status,
      "SUCCESS",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy marks the deployment as FAILED and preserves partial output when the deploy command times out", async () => {
  const project = createProjectRecord("zip");
  const executedCommands: DeployCommandInput[] = [];
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async (command) => {
      executedCommands.push(command);

      return {
        exitCode: 1,
        stderr: "Deploy timed out after 25ms\n",
        timedOut: true,
        stdout: "partial stdout before timeout\n",
      };
    },
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(DeploymentSchema.parse(response.json()).status, "FAILED");
    assert.equal(executedCommands[0]?.timeoutMs, 25);

    const deployLog = readFileSync(
      context.runtimePaths.getProjectDeployLogFile(project.id),
      "utf8",
    );

    assert.equal(deployLog.includes("partial stdout before timeout"), true);
    assert.equal(deployLog.includes("Deploy timed out after 25ms"), true);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy releases the project lock after a timeout", async () => {
  const project = createProjectRecord("git");
  let attempt = 0;
  const context = await createCustomDeployEndpointContext({
    deployTimeoutMs: 25,
    project,
    runDeployCommand: async () => {
      attempt += 1;

      if (attempt === 1) {
        return {
          exitCode: 1,
          stderr: "Deploy timed out after 25ms\n",
          timedOut: true,
          stdout: "partial stdout before timeout\n",
        };
      }

      return {
        exitCode: 0,
        stderr: "",
        stdout: "",
      };
    },
  });

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const accessToken = await loginAsAdmin(context.app);

    const firstResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(DeploymentSchema.parse(firstResponse.json()).status, "FAILED");

    const secondResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(secondResponse.statusCode, 200);
    assert.equal(
      DeploymentSchema.parse(secondResponse.json()).status,
      "SUCCESS",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy returns a standardized 404 when the project is missing", async () => {
  const context = await createDeployEndpointContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      url: "/api/projects/project_missing/deploy",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/deploy returns a standardized 401 when the access token is missing", async () => {
  const project = createProjectRecord("zip");
  const context = await createDeployEndpointContext(project);

  try {
    const response = await context.app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/deploy`,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});
