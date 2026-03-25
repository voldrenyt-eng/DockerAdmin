import assert from "node:assert/strict";
import test from "node:test";

import { AuthSchema, DomainSchema } from "@dockeradmin/shared";

import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { appErrors } from "./errors.js";
import { buildApp } from "./server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createDomainServiceDouble = () => {
  const domains = new Map<string, ReturnType<typeof DomainSchema.parse>>();
  let sequence = 1;

  return {
    async createDomain(input: {
      host: string;
      port: number;
      projectId: string;
      serviceName: string;
      tlsEnabled: boolean;
    }) {
      if (input.projectId === "project_missing") {
        throw appErrors.notFound("Project not found");
      }

      if (input.host === "duplicate.example.com") {
        throw appErrors.conflict("Domain host already exists");
      }

      if (input.serviceName === "missing-service") {
        throw appErrors.notFound("Service not found");
      }

      const domain = DomainSchema.parse({
        ...input,
        id: `domain_${sequence++}`,
      });

      domains.set(domain.id, domain);

      return domain;
    },
    async deleteDomain(id: string) {
      if (!domains.delete(id)) {
        throw appErrors.notFound("Domain not found");
      }
    },
    async listDomains() {
      return Array.from(domains.values());
    },
    seedDomains(values: Array<ReturnType<typeof DomainSchema.parse>>) {
      domains.clear();

      for (const domain of values) {
        domains.set(domain.id, domain);
      }
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
  const domainService = createDomainServiceDouble();
  const app = buildApp({
    authService,
    domainService,
  } as never);

  return {
    app,
    domainService,
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

test("POST /api/domains creates a domain binding for an authenticated admin", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      },
      url: "/api/domains",
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(DomainSchema.parse(response.json()), {
      host: "app.example.com",
      id: "domain_1",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: true,
    });
  } finally {
    await app.close();
  }
});

test("POST /api/domains returns a standardized 404 when the project is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "app.example.com",
        port: 8080,
        projectId: "project_missing",
        serviceName: "api",
        tlsEnabled: false,
      },
      url: "/api/domains",
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

test("POST /api/domains returns a standardized 422 for an invalid FQDN host", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "localhost",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: false,
      },
      url: "/api/domains",
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

test("POST /api/domains returns a standardized 422 when the port is out of range", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "app.example.com",
        port: 65536,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: false,
      },
      url: "/api/domains",
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

test("POST /api/domains returns a standardized 409 when the host already exists", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "duplicate.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      },
      url: "/api/domains",
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: {
        code: "CONFLICT",
        message: "Domain host already exists",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/domains returns a standardized 404 when the target service is missing from the runtime", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "missing-service",
        tlsEnabled: false,
      },
      url: "/api/domains",
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

test("GET /api/domains returns existing bindings for an authenticated admin", async () => {
  const { app, domainService } = await createTestApp();

  try {
    domainService.seedDomains([
      DomainSchema.parse({
        host: "app.example.com",
        id: "domain_1",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      }),
      DomainSchema.parse({
        host: "admin.example.com",
        id: "domain_2",
        port: 3001,
        projectId: "project_2",
        serviceName: "web",
        tlsEnabled: false,
      }),
    ]);

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/domains",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      {
        host: "app.example.com",
        id: "domain_1",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      },
      {
        host: "admin.example.com",
        id: "domain_2",
        port: 3001,
        projectId: "project_2",
        serviceName: "web",
        tlsEnabled: false,
      },
    ]);
  } finally {
    await app.close();
  }
});

test("DELETE /api/domains/:id deletes an existing binding for an authenticated admin", async () => {
  const { app, domainService } = await createTestApp();

  try {
    domainService.seedDomains([
      DomainSchema.parse({
        host: "app.example.com",
        id: "domain_1",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      }),
    ]);

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "DELETE",
      url: "/api/domains/domain_1",
    });

    assert.equal(response.statusCode, 204);

    const listResponse = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/domains",
    });

    assert.deepEqual(listResponse.json(), []);
  } finally {
    await app.close();
  }
});

test("DELETE /api/domains/:id returns a standardized 404 when the binding is missing", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "DELETE",
      url: "/api/domains/domain_missing",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Domain not found",
      },
    });
  } finally {
    await app.close();
  }
});

test("domains CRUD routes return a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      },
      url: "/api/domains",
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/domains",
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/domains/domain_1",
    });

    for (const response of [createResponse, listResponse, deleteResponse]) {
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }
  } finally {
    await app.close();
  }
});
