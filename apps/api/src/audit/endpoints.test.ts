import assert from "node:assert/strict";
import test from "node:test";

import { AuditLogListResponseSchema, AuthSchema } from "@dockeradmin/shared";

import { hashPassword } from "../auth/password.js";
import { createAuthRepository } from "../auth/repository.js";
import { createAuthService } from "../auth/service.js";
import { buildApp } from "../server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createAuditServiceDouble = () => {
  const calls: Array<{
    action: string;
    entityType: string;
    page: number;
    pageSize: number;
    q: string;
  }> = [];
  const exportCalls: Array<{
    action: string;
    entityType: string;
    q: string;
  }> = [];
  let responseBody: unknown = {
    auditLogs: [],
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  };
  let exportResponseBody =
    "createdAt,action,entityType,entityId,projectId,userId,message";

  return {
    calls,
    exportCalls,
    seedResponse(nextResponse: unknown) {
      responseBody = nextResponse;
    },
    seedExportResponse(nextResponse: string) {
      exportResponseBody = nextResponse;
    },
    async listAuditLogs(input: {
      action: string;
      entityType: string;
      page: number;
      pageSize: number;
      q: string;
    }) {
      calls.push(input);

      return responseBody;
    },
    async exportAuditLogsCsv(input: {
      action: string;
      entityType: string;
      q: string;
    }) {
      exportCalls.push(input);

      return exportResponseBody;
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
  const auditService = createAuditServiceDouble();
  const app = buildApp({
    auditService,
    authService,
  } as never);

  return {
    app,
    auditService,
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

test("GET /api/audit returns audit logs for an authenticated admin", async () => {
  const { app, auditService } = await createTestApp();

  try {
    auditService.seedResponse({
      auditLogs: [
        {
          action: "ENV_UPDATE",
          createdAt: "2026-03-23T10:01:00.000Z",
          entityId: "env_1",
          entityType: "env",
          id: "audit_2",
          message: "Environment updated",
          projectId: "project_1",
          userId: "user_admin",
        },
        {
          action: "AUTH_LOGIN",
          createdAt: "2026-03-23T10:00:00.000Z",
          entityId: null,
          entityType: "auth",
          id: "audit_1",
          message: "Admin login succeeded",
          projectId: null,
          userId: "user_admin",
        },
      ],
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/audit?page=2&pageSize=2&q=env&action=ENV_UPDATE&entityType=env",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(auditService.calls, [
      {
        action: "ENV_UPDATE",
        entityType: "env",
        page: 2,
        pageSize: 2,
        q: "env",
      },
    ]);
    assert.deepEqual(
      response.json(),
      AuditLogListResponseSchema.parse({
        auditLogs: [
          {
            action: "ENV_UPDATE",
            createdAt: "2026-03-23T10:01:00.000Z",
            entityId: "env_1",
            entityType: "env",
            id: "audit_2",
            message: "Environment updated",
            projectId: "project_1",
            userId: "user_admin",
          },
          {
            action: "AUTH_LOGIN",
            createdAt: "2026-03-23T10:00:00.000Z",
            entityId: null,
            entityType: "auth",
            id: "audit_1",
            message: "Admin login succeeded",
            projectId: null,
            userId: "user_admin",
          },
        ],
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      }),
    );
  } finally {
    await app.close();
  }
});

test("GET /api/audit defaults page and pageSize when the query parameters are omitted", async () => {
  const { app, auditService } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/audit",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(auditService.calls, [
      {
        action: "",
        entityType: "",
        page: 1,
        pageSize: 25,
        q: "",
      },
    ]);
    assert.deepEqual(response.json(), {
      auditLogs: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  } finally {
    await app.close();
  }
});

test("GET /api/audit returns a standardized 422 when page or pageSize is outside the allowed range", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/audit?page=0&pageSize=101",
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

test("GET /api/audit returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/audit?page=1&pageSize=25",
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

test("GET /api/audit/export returns CSV for all matching audit rows for an authenticated admin", async () => {
  const { app, auditService } = await createTestApp();

  try {
    auditService.seedExportResponse(
      [
        "createdAt,action,entityType,entityId,projectId,userId,message",
        "2026-03-23T10:01:00.000Z,ENV_UPDATE,env,env_1,project_1,user_admin,Environment updated",
      ].join("\r\n"),
    );

    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/audit/export?q=env&action=ENV_UPDATE&entityType=env",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(auditService.exportCalls, [
      {
        action: "ENV_UPDATE",
        entityType: "env",
        q: "env",
      },
    ]);
    assert.match(
      response.headers["content-type"] ?? "",
      /^text\/csv;\s*charset=utf-8/i,
    );
    assert.match(
      response.headers["content-disposition"] ?? "",
      /^attachment;\s*filename="audit-export-\d{4}-\d{2}-\d{2}\.csv"$/i,
    );
    assert.equal(
      response.body,
      [
        "createdAt,action,entityType,entityId,projectId,userId,message",
        "2026-03-23T10:01:00.000Z,ENV_UPDATE,env,env_1,project_1,user_admin,Environment updated",
      ].join("\r\n"),
    );
  } finally {
    await app.close();
  }
});

test("GET /api/audit/export returns a standardized 422 when action is invalid", async () => {
  const { app } = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/audit/export?action=NOT_REAL",
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

test("GET /api/audit/export returns a standardized 401 when the access token is missing", async () => {
  const { app } = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/audit/export",
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
