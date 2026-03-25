import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./server.js";

const WEB_ORIGIN = "http://localhost:5173";

test("GET /api/health returns baseline security headers", async () => {
  const app = buildApp({
    webOrigin: WEB_ORIGIN,
  } as never);

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(
    response.headers["permissions-policy"],
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  );
});

test("GET /api/health echoes Access-Control-Allow-Origin only for the configured web origin", async () => {
  const app = buildApp({
    webOrigin: WEB_ORIGIN,
  } as never);

  const allowedResponse = await app.inject({
    headers: {
      origin: WEB_ORIGIN,
    },
    method: "GET",
    url: "/api/health",
  });
  const blockedResponse = await app.inject({
    headers: {
      origin: "http://localhost:4173",
    },
    method: "GET",
    url: "/api/health",
  });

  assert.equal(allowedResponse.statusCode, 200);
  assert.equal(
    allowedResponse.headers["access-control-allow-origin"],
    WEB_ORIGIN,
  );
  assert.match(String(allowedResponse.headers.vary), /Origin/);
  assert.equal(blockedResponse.statusCode, 200);
  assert.equal(
    blockedResponse.headers["access-control-allow-origin"],
    undefined,
  );
});

test("OPTIONS preflight for an allowed web origin returns CORS allow headers", async () => {
  const app = buildApp({
    webOrigin: WEB_ORIGIN,
  } as never);

  const response = await app.inject({
    headers: {
      "access-control-request-headers": "authorization,content-type",
      "access-control-request-method": "POST",
      origin: WEB_ORIGIN,
    },
    method: "OPTIONS",
    url: "/api/auth/login",
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], WEB_ORIGIN);
  assert.match(
    String(response.headers["access-control-allow-methods"]),
    /POST/,
  );
  assert.equal(
    response.headers["access-control-allow-headers"],
    "authorization,content-type",
  );
  assert.match(String(response.headers.vary), /Origin/);
  assert.match(String(response.headers.vary), /Access-Control-Request-Headers/);
});

test("OPTIONS preflight for a disallowed origin returns a standardized 403", async () => {
  const app = buildApp({
    webOrigin: WEB_ORIGIN,
  } as never);

  const response = await app.inject({
    headers: {
      "access-control-request-method": "POST",
      origin: "http://localhost:4173",
    },
    method: "OPTIONS",
    url: "/api/auth/login",
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: {
      code: "FORBIDDEN",
      message: "CORS origin is not allowed",
    },
  });
});
