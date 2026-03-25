import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./server.js";

test("POST /api/contracts/auth/login returns a standardized 422 validation error", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/contracts/auth/login",
    payload: {
      email: "not-an-email",
      password: "",
    },
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Request payload does not match the shared DTO contract",
    },
  });
});

for (const scenario of [
  {
    code: "UNAUTHORIZED",
    expectedMessage: "Authentication required",
    statusCode: 401,
    url: "/api/contracts/error/unauthorized",
  },
  {
    code: "FORBIDDEN",
    expectedMessage: "Action is forbidden",
    statusCode: 403,
    url: "/api/contracts/error/forbidden",
  },
  {
    code: "CONFLICT",
    expectedMessage: "Resource state conflict",
    statusCode: 409,
    url: "/api/contracts/error/conflict",
  },
  {
    code: "INTERNAL_ERROR",
    expectedMessage: "Internal server error",
    statusCode: 500,
    url: "/api/contracts/error/internal",
  },
] as const) {
  test(`GET ${scenario.url} returns standardized ${scenario.statusCode} ${scenario.code}`, async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: scenario.url,
    });

    assert.equal(response.statusCode, scenario.statusCode);
    assert.deepEqual(response.json(), {
      error: {
        code: scenario.code,
        message: scenario.expectedMessage,
      },
    });
  });
}

test("GET unknown route returns a standardized 404 not found error", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/does-not-exist",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});
