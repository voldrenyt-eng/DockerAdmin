import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthSchema,
  type ServiceDto,
  ServiceSchema,
} from "@dockeradmin/shared";

import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { appErrors } from "./errors.js";
import { buildApp } from "./server.js";
import { createServiceId } from "./services/identity.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createServiceServiceDouble = () => {
  const servicesByProjectId = new Map<string, ServiceDto[]>();
  const failuresByProjectId = new Map<string, Error>();
  const actionCalls: Array<{
    action: "start" | "stop" | "restart";
    serviceId: string;
    userId: string | null;
  }> = [];
  const actionFailuresByServiceId = new Map<string, Error>();
  const actionResultByServiceId = new Map<string, ServiceDto>();

  return {
    actionCalls,
    seedProjectServices(projectId: string, services: ServiceDto[]) {
      servicesByProjectId.set(projectId, services);
    },
    seedActionResult(serviceId: string, service: ServiceDto) {
      actionResultByServiceId.set(serviceId, service);
    },
    failProject(projectId: string, error: Error) {
      failuresByProjectId.set(projectId, error);
    },
    failAction(serviceId: string, error: Error) {
      actionFailuresByServiceId.set(serviceId, error);
    },
    async listProjectServices(input: { projectId: string }): Promise<
      ServiceDto[]
    > {
      const failure = failuresByProjectId.get(input.projectId);

      if (failure) {
        throw failure;
      }

      const services = servicesByProjectId.get(input.projectId);

      if (!services) {
        throw appErrors.notFound("Project not found");
      }

      return services;
    },
    async performServiceAction(input: {
      action: "start" | "stop" | "restart";
      serviceId: string;
      userId: string | null;
    }): Promise<ServiceDto> {
      actionCalls.push(input);

      const failure = actionFailuresByServiceId.get(input.serviceId);

      if (failure) {
        throw failure;
      }

      const result = actionResultByServiceId.get(input.serviceId);

      if (!result) {
        throw appErrors.notFound("Service not found");
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
  const serviceService = createServiceServiceDouble();
  const app = buildApp({
    authService,
    serviceService,
  } as never);

  return {
    app,
    serviceService,
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

test("GET /api/projects/:id/services returns project services for an authenticated admin", async () => {
  const { app, serviceService } = await createTestApp();

  try {
    serviceService.seedProjectServices("project_1", [
      {
        containerName: "demo-api-1",
        image: "nginx:1.27",
        ports: ["8080->80/tcp", "8443->443/tcp"],
        serviceId: createServiceId({
          projectId: "project_1",
          serviceName: "api",
        }),
        serviceName: "api",
        startedAt: "2026-03-19T15:20:00.000Z",
        status: "running",
      },
      {
        containerName: "demo-worker-1",
        image: "busybox:1.36",
        ports: [],
        serviceId: createServiceId({
          projectId: "project_1",
          serviceName: "worker",
        }),
        serviceName: "worker",
        startedAt: null,
        status: "stopped",
      },
    ]);

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/services",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      ServiceSchema.parse({
        containerName: "demo-api-1",
        image: "nginx:1.27",
        ports: ["8080->80/tcp", "8443->443/tcp"],
        serviceId: createServiceId({
          projectId: "project_1",
          serviceName: "api",
        }),
        serviceName: "api",
        startedAt: "2026-03-19T15:20:00.000Z",
        status: "running",
      }),
      ServiceSchema.parse({
        containerName: "demo-worker-1",
        image: "busybox:1.36",
        ports: [],
        serviceId: createServiceId({
          projectId: "project_1",
          serviceName: "worker",
        }),
        serviceName: "worker",
        startedAt: null,
        status: "stopped",
      }),
    ]);
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/services returns an empty array when the project has no services", async () => {
  const { app, serviceService } = await createTestApp();

  try {
    serviceService.seedProjectServices("project_1", []);
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/services",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id/services returns a standardized 404 when the project is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_missing/services",
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

test("GET /api/projects/:id/services returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project_1/services",
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

test("GET /api/projects/:id/services returns a safe standardized 500 when runtime lookup fails", async () => {
  const { app, serviceService } = await createTestApp();

  try {
    serviceService.failProject(
      "project_1",
      new Error("docker compose ps leaked internals"),
    );
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_1/services",
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

test("POST /api/services/:serviceId/action executes a service action for an authenticated admin", async () => {
  const { app, serviceService } = await createTestApp();

  try {
    const serviceId = createServiceId({
      projectId: "project_1",
      serviceName: "api",
    });

    serviceService.seedActionResult(serviceId, {
      containerName: "demo-api-1",
      image: "nginx:1.27",
      ports: ["8080->80/tcp"],
      serviceId,
      serviceName: "api",
      startedAt: "2026-03-20T08:15:00.000Z",
      status: "running",
    });

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        action: "restart",
      },
      url: `/api/services/${serviceId}/action`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(serviceService.actionCalls, [
      {
        action: "restart",
        serviceId,
        userId: "user_admin",
      },
    ]);
    assert.deepEqual(
      response.json(),
      ServiceSchema.parse({
        containerName: "demo-api-1",
        image: "nginx:1.27",
        ports: ["8080->80/tcp"],
        serviceId,
        serviceName: "api",
        startedAt: "2026-03-20T08:15:00.000Z",
        status: "running",
      }),
    );
  } finally {
    await app.close();
  }
});

test("POST /api/services/:serviceId/action returns a standardized 422 for an unsupported action", async () => {
  const { app } = await createTestApp();

  try {
    const serviceId = createServiceId({
      projectId: "project_1",
      serviceName: "api",
    });
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        action: "pause",
      },
      url: `/api/services/${serviceId}/action`,
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

test("POST /api/services/:serviceId/action returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const serviceId = createServiceId({
      projectId: "project_1",
      serviceName: "api",
    });
    const response = await app.inject({
      method: "POST",
      payload: {
        action: "restart",
      },
      url: `/api/services/${serviceId}/action`,
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

test("POST /api/services/:serviceId/action returns a standardized 404 when the service is missing", async () => {
  const { app } = await createTestApp();

  try {
    const serviceId = createServiceId({
      projectId: "project_missing",
      serviceName: "api",
    });
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        action: "restart",
      },
      url: `/api/services/${serviceId}/action`,
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Service not found",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/services/:serviceId/action returns a safe standardized 500 when the docker action fails", async () => {
  const { app, serviceService } = await createTestApp();

  try {
    const serviceId = createServiceId({
      projectId: "project_1",
      serviceName: "api",
    });

    serviceService.failAction(
      serviceId,
      new Error("docker compose restart leaked internals"),
    );

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        action: "restart",
      },
      url: `/api/services/${serviceId}/action`,
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
