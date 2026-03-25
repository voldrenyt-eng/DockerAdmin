import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AuthSchema,
  ProjectEnvResponseSchema,
  ProjectSchema,
} from "@dockeradmin/shared";

import { createAuditLogCapture } from "./audit/test-utils.js";
import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import {
  ENV_DECRYPT_FAILED_MESSAGE,
  ENV_INVALID_FORMAT_MESSAGE,
  createEnvService,
  decryptEnvContent,
  encryptEnvContent,
} from "./env/service.js";
import { createProjectRepository } from "./projects/repository.js";
import { createProjectService } from "./projects/service.js";
import { createRuntimePaths } from "./runtime/paths.js";
import { buildApp } from "./server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";
const ENV_ENCRYPTION_KEY = "test-env-encryption-key";

const createEnvTestContext = async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-env-"));
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
  const projectRepository = createProjectRepository();
  const runtimePaths = createRuntimePaths({ dataRoot });
  const projectService = createProjectService({
    projectRepository,
    runtimePaths,
  });
  const auditLogCapture = createAuditLogCapture();
  const envService = createEnvService({
    auditLogRepository: auditLogCapture.auditLogRepository,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
    projectRepository,
    runtimePaths,
  });
  const app = buildApp({
    authService,
    envService,
    projectService,
  } as never);

  return {
    app,
    auditLogCapture,
    dataRoot,
    runtimePaths,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createEnvTestContext>>["app"],
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

const createEnvProject = async (
  app: Awaited<ReturnType<typeof createEnvTestContext>>["app"],
  accessToken: string,
) => {
  const response = await app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Env Project",
      sourceType: "git",
    },
    url: "/api/projects",
  });

  assert.equal(response.statusCode, 201);

  return ProjectSchema.parse(response.json());
};

test("encryptEnvContent/decryptEnvContent round-trips content without embedding plaintext", () => {
  const content =
    "DATABASE_URL=postgres://user:pass@db/app\nTOKEN=secret-value\n";
  const encrypted = encryptEnvContent({
    content,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
  });
  const decrypted = decryptEnvContent({
    encryptedContent: encrypted,
    envEncryptionKey: ENV_ENCRYPTION_KEY,
  });

  assert.equal(encrypted.includes("secret-value"), false);
  assert.equal(encrypted.includes("postgres://user:pass@db/app"), false);
  assert.equal(decrypted, content);
});

test("decryptEnvContent throws a safe error for corrupted encrypted payloads", () => {
  assert.throws(
    () =>
      decryptEnvContent({
        encryptedContent: "not-a-valid-envelope",
        envEncryptionKey: ENV_ENCRYPTION_KEY,
      }),
    {
      message: ENV_DECRYPT_FAILED_MESSAGE,
    },
  );
});

test("PUT /api/projects/:id/env returns a standardized 401 when access token is missing", async () => {
  const context = await createEnvTestContext();

  try {
    const response = await context.app.inject({
      method: "PUT",
      payload: {
        content: "TOKEN=secret-value\n",
      },
      url: "/api/projects/project_1/env",
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

test("PUT then GET /api/projects/:id/env stores encrypted content on disk and returns the original admin content", async () => {
  const context = await createEnvTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createEnvProject(context.app, accessToken);
    const content =
      "# comment\nDATABASE_URL=postgres://user:pass@db/app\nTOKEN=secret-value\nEMPTY=\n";
    const putResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "PUT",
      payload: {
        content,
      },
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(putResponse.statusCode, 204);

    const envFile = context.runtimePaths.getProjectEnvFile(project.id);
    const encryptedContent = readFileSync(envFile, "utf8");

    assert.equal(existsSync(envFile), true);
    assert.equal(encryptedContent.includes("secret-value"), false);
    assert.equal(
      encryptedContent.includes("postgres://user:pass@db/app"),
      false,
    );
    assert.equal(
      existsSync(join(context.dataRoot, "projects", project.id, ".env")),
      false,
    );

    const getResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(getResponse.statusCode, 200);
    assert.deepEqual(ProjectEnvResponseSchema.parse(getResponse.json()), {
      content,
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("PUT /api/projects/:id/env writes a safe ENV_UPDATE audit record", async () => {
  const context = await createEnvTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createEnvProject(context.app, accessToken);
    const content =
      "DATABASE_URL=postgres://user:pass@db/app\nTOKEN=secret-value\n";
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "PUT",
      payload: {
        content,
      },
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(response.statusCode, 204);
    assert.deepEqual(context.auditLogCapture.listAuditLogs(), [
      {
        action: "ENV_UPDATE",
        entityId: project.id,
        entityType: "project",
        message: "Project env updated",
        projectId: project.id,
        userId: "user_admin",
      },
    ]);
    assert.equal(
      context.auditLogCapture
        .listAuditLogs()[0]
        ?.message?.includes("secret-value"),
      false,
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("PUT /api/projects/:id/env rejects invalid content with a standardized 422 and does not write env.enc", async () => {
  const context = await createEnvTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createEnvProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "PUT",
      payload: {
        content: "TOKEN=secret-value\nBROKEN_LINE\n",
      },
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: ENV_INVALID_FORMAT_MESSAGE,
      },
    });
    assert.equal(
      existsSync(context.runtimePaths.getProjectEnvFile(project.id)),
      false,
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects/:id/env returns a standardized 404 when env.enc is missing", async () => {
  const context = await createEnvTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createEnvProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project env file not found",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects/:id/env returns a standardized 500 when env.enc cannot be decrypted", async () => {
  const context = await createEnvTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createEnvProject(context.app, accessToken);

    writeFileSync(
      context.runtimePaths.getProjectEnvFile(project.id),
      "not-a-valid-envelope",
      "utf8",
    );

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${project.id}/env`,
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});
