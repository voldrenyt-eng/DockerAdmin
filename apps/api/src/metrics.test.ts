import assert from "node:assert/strict";
import test from "node:test";

import { AuthSchema, MetricsSchema } from "@dockeradmin/shared";

import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { appErrors } from "./errors.js";
import { buildApp } from "./server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createMetricsServiceDouble = () => {
  const metricsByProjectId = new Map<string, unknown[]>();
  const failuresByProjectId = new Map<string, Error>();
  const calls: Array<{ projectId: string }> = [];

  return {
    calls,
    failProjectMetrics(projectId: string, error: Error) {
      failuresByProjectId.set(projectId, error);
    },
    seedProjectMetrics(projectId: string, metrics: unknown[]) {
      metricsByProjectId.set(projectId, metrics);
    },
    async listProjectMetrics(input: { projectId: string }) {
      calls.push(input);

      const failure = failuresByProjectId.get(input.projectId);

      if (failure) {
        throw failure;
      }

      const metrics = metricsByProjectId.get(input.projectId);

      if (!metrics) {
        throw appErrors.notFound("Project not found");
      }

      return metrics;
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
  const metricsService = createMetricsServiceDouble();
  const app = buildApp({
    authService,
    metricsService,
  } as never);

  return {
    app,
    metricsService,
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

test("GET /api/metrics returns project metrics for an authenticated admin", async () => {
  const { app, metricsService } = await createTestApp();

  try {
    metricsService.seedProjectMetrics("project_1", [
      {
        cpuPercent: 1.25,
        memoryLimitBytes: 268435456,
        memoryUsageBytes: 73400320,
        networkRxBytes: 1024,
        networkTxBytes: 2048,
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
    ]);

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/metrics?projectId=project_1",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(metricsService.calls, [{ projectId: "project_1" }]);
    assert.deepEqual(response.json(), [
      MetricsSchema.parse({
        cpuPercent: 1.25,
        memoryLimitBytes: 268435456,
        memoryUsageBytes: 73400320,
        networkRxBytes: 1024,
        networkTxBytes: 2048,
        serviceName: "api",
      }),
      MetricsSchema.parse({
        cpuPercent: 0,
        memoryLimitBytes: 0,
        memoryUsageBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        serviceName: "worker",
      }),
    ]);
  } finally {
    await app.close();
  }
});

test("GET /api/metrics returns a standardized 422 when projectId is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/metrics",
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

test("GET /api/metrics returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/metrics?projectId=project_1",
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

test("GET /api/metrics returns a standardized 404 when the project is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/metrics?projectId=project_missing",
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

test("GET /api/metrics returns a safe standardized 500 when metrics lookup fails", async () => {
  const { app, metricsService } = await createTestApp();

  try {
    metricsService.failProjectMetrics(
      "project_1",
      new Error("docker stats leaked internals"),
    );

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/metrics?projectId=project_1",
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
