import assert from "node:assert/strict";
import test from "node:test";

import { AuthSchema, AuthUserSchema } from "@dockeradmin/shared";

import { createAuditLogCapture } from "../audit/test-utils.js";
import { buildApp } from "../server.js";
import { hashPassword } from "./password.js";
import { createAuthRepository } from "./repository.js";
import { createAuthService } from "./service.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

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

  return buildApp({ authService });
};

const createAuditedTestContext = async () => {
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
  const auditLogCapture = createAuditLogCapture();
  const authService = createAuthService({
    auditLogRepository: auditLogCapture.auditLogRepository,
    authRepository,
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
  });
  const app = buildApp({ authService });

  return {
    app,
    auditLogCapture,
  };
};

test("POST /api/auth/login returns tokens and the admin user for valid credentials", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });

    assert.equal(response.statusCode, 200);

    const body = AuthSchema.parse(response.json());

    assert.equal(body.user.email, ADMIN_EMAIL);
    assert.equal(body.user.role, "ADMIN");
    assert.notEqual(body.tokens.accessToken, body.tokens.refreshToken);
  } finally {
    await app.close();
  }
});

test("POST /api/auth/login writes a safe AUTH_LOGIN audit record for valid credentials", async () => {
  const { app, auditLogCapture } = await createAuditedTestContext();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(auditLogCapture.listAuditLogs(), [
      {
        action: "AUTH_LOGIN",
        entityId: "user_admin",
        entityType: "auth",
        message: "Login succeeded",
        projectId: null,
        userId: "user_admin",
      },
    ]);
  } finally {
    await app.close();
  }
});

test("POST /api/auth/login returns a standardized 401 for invalid credentials", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: "wrong-password",
      },
      url: "/api/auth/login",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/auth/login writes a safe AUTH_LOGIN audit record for invalid credentials", async () => {
  const { app, auditLogCapture } = await createAuditedTestContext();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: "wrong-password",
      },
      url: "/api/auth/login",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(auditLogCapture.listAuditLogs(), [
      {
        action: "AUTH_LOGIN",
        entityId: "user_admin",
        entityType: "auth",
        message: "Login failed",
        projectId: null,
        userId: "user_admin",
      },
    ]);
    assert.equal(
      auditLogCapture.listAuditLogs()[0]?.message?.includes("wrong-password"),
      false,
    );
    assert.equal(
      auditLogCapture.listAuditLogs()[0]?.message?.includes(ADMIN_EMAIL),
      false,
    );
  } finally {
    await app.close();
  }
});

test("POST /api/auth/refresh rotates the refresh token and invalidates the old one", async () => {
  const app = await createTestApp();

  try {
    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });
    const loginBody = AuthSchema.parse(loginResponse.json());

    const refreshResponse = await app.inject({
      method: "POST",
      payload: {
        refreshToken: loginBody.tokens.refreshToken,
      },
      url: "/api/auth/refresh",
    });

    assert.equal(refreshResponse.statusCode, 200);

    const refreshBody = AuthSchema.parse(refreshResponse.json());

    assert.notEqual(
      refreshBody.tokens.refreshToken,
      loginBody.tokens.refreshToken,
    );
    assert.notEqual(
      refreshBody.tokens.accessToken,
      loginBody.tokens.accessToken,
    );

    const staleRefreshResponse = await app.inject({
      method: "POST",
      payload: {
        refreshToken: loginBody.tokens.refreshToken,
      },
      url: "/api/auth/refresh",
    });

    assert.equal(staleRefreshResponse.statusCode, 401);
    assert.deepEqual(staleRefreshResponse.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired refresh token",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/auth/logout revokes the current refresh token", async () => {
  const app = await createTestApp();

  try {
    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });
    const loginBody = AuthSchema.parse(loginResponse.json());

    const logoutResponse = await app.inject({
      method: "POST",
      payload: {
        refreshToken: loginBody.tokens.refreshToken,
      },
      url: "/api/auth/logout",
    });

    assert.equal(logoutResponse.statusCode, 204);
    assert.equal(logoutResponse.body, "");

    const refreshResponse = await app.inject({
      method: "POST",
      payload: {
        refreshToken: loginBody.tokens.refreshToken,
      },
      url: "/api/auth/refresh",
    });

    assert.equal(refreshResponse.statusCode, 401);
    assert.deepEqual(refreshResponse.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired refresh token",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/auth/logout writes a safe AUTH_LOGOUT audit record", async () => {
  const { app, auditLogCapture } = await createAuditedTestContext();

  try {
    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });
    const loginBody = AuthSchema.parse(loginResponse.json());

    auditLogCapture.clearAuditLogs();

    const logoutResponse = await app.inject({
      method: "POST",
      payload: {
        refreshToken: loginBody.tokens.refreshToken,
      },
      url: "/api/auth/logout",
    });

    assert.equal(logoutResponse.statusCode, 204);
    assert.deepEqual(auditLogCapture.listAuditLogs(), [
      {
        action: "AUTH_LOGOUT",
        entityId: "user_admin",
        entityType: "auth",
        message: "Logout succeeded",
        projectId: null,
        userId: "user_admin",
      },
    ]);
  } finally {
    await app.close();
  }
});

test("GET /api/me returns the current admin user for a valid access token", async () => {
  const app = await createTestApp();

  try {
    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      url: "/api/auth/login",
    });
    const loginBody = AuthSchema.parse(loginResponse.json());

    const meResponse = await app.inject({
      headers: {
        authorization: `Bearer ${loginBody.tokens.accessToken}`,
      },
      method: "GET",
      url: "/api/me",
    });

    assert.equal(meResponse.statusCode, 200);
    assert.deepEqual(AuthUserSchema.parse(meResponse.json()), {
      email: ADMIN_EMAIL,
      id: "user_admin",
      role: "ADMIN",
    });
  } finally {
    await app.close();
  }
});

test("GET /api/me returns a standardized 401 when the access token is missing", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
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

test("GET /api/me returns a standardized 401 for an invalid access token", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      headers: {
        authorization: "Bearer definitely-invalid-token",
      },
      method: "GET",
      url: "/api/me",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired access token",
      },
    });
  } finally {
    await app.close();
  }
});
