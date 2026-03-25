import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./server.js";

test("GET /api/health returns the API health payload", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: "api",
    status: "ok",
  });
});

test("GET /api/contracts/project returns a response validated by shared DTO", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/contracts/project",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();

  assert.equal(body.slug, "dockeradmin");
});

test("POST /api/contracts/auth/login rejects invalid request payload via shared DTO", async () => {
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

  const body = response.json();

  assert.equal(body.error.code, "VALIDATION_ERROR");
});
