import assert from "node:assert/strict";
import test from "node:test";

import { AuthSchema } from "@dockeradmin/shared";

import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { appErrors } from "./errors.js";
import { buildApp } from "./server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createLogsServiceDouble = () => {
  const logsByKey = new Map<
    string,
    { lines: string[]; serviceName: string; tail: number }
  >();
  const failuresByKey = new Map<string, Error>();
  const calls: Array<{
    projectId: string;
    serviceName: string;
    tail: number;
  }> = [];

  return {
    calls,
    seedProjectLogs(input: {
      lines: string[];
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      logsByKey.set(`${input.projectId}:${input.serviceName}:${input.tail}`, {
        lines: input.lines,
        serviceName: input.serviceName,
        tail: input.tail,
      });
    },
    failProjectLogs(input: {
      error: Error;
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      failuresByKey.set(
        `${input.projectId}:${input.serviceName}:${input.tail}`,
        input.error,
      );
    },
    async getProjectLogs(input: {
      projectId: string;
      serviceName: string;
      tail: number;
    }) {
      calls.push(input);

      const key = `${input.projectId}:${input.serviceName}:${input.tail}`;
      const failure = failuresByKey.get(key);

      if (failure) {
        throw failure;
      }

      const result = logsByKey.get(key);

      if (!result) {
        throw appErrors.notFound("Project not found");
      }

      return result;
    },
  };
};

const createTestApp = async () => {
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
  const logsService = createLogsServiceDouble();
  const app = buildApp({
    authService,
    logsService,
  } as never);

  return {
    app,
    logsService,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    payload: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    url: "/api/auth/login",
  });

  const body = AuthSchema.parse(response.json());

  return body.tokens.accessToken;
};

test("GET /api/projects/:id/logs returns project service logs for an authenticated admin", async () => {
  const { app, logsService } = await createTestApp();

  try {
    logsService.seedProjectLogs({
      lines: ["demo-api-1  | ready", "demo-api-1  | serving"],
      projectId: "project_1",
      serviceName: "api",
      tail: 50,
    });

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/logs?serviceName=api&tail=50",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(logsService.calls, [
      {
        projectId: "project_1",
        serviceName: "api",
        tail: 50,
      },
    ]);
    assert.deepEqual(response.json(), {
      lines: ["demo-api-1  | ready", "demo-api-1  | serving"],
      serviceName: "api",
      tail: 50,
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/logs applies the default tail when it is omitted", async () => {
  const { app, logsService } = await createTestApp();

  try {
    logsService.seedProjectLogs({
      lines: ["demo-api-1  | ready"],
      projectId: "project_1",
      serviceName: "api",
      tail: 200,
    });

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/logs?serviceName=api",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(logsService.calls, [
      {
        projectId: "project_1",
        serviceName: "api",
        tail: 200,
      },
    ]);
    assert.deepEqual(response.json(), {
      lines: ["demo-api-1  | ready"],
      serviceName: "api",
      tail: 200,
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/logs returns a standardized 422 when serviceName is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/logs",
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request payload does not match the shared DTO contract",
      },
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/logs returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project_1/logs?serviceName=api",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/logs returns a standardized 404 when the project or service is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_missing/logs?serviceName=api",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
      },
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/logs returns a safe standardized 500 when logs lookup fails", async () => {
  const { app, logsService } = await createTestApp();

  try {
    logsService.failProjectLogs({
      error: new Error("docker compose logs leaked internals"),
      projectId: "project_1",
      serviceName: "api",
      tail: 200,
    });

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/logs?serviceName=api",
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    });
  } finally {
    await app.close();
  }
});
