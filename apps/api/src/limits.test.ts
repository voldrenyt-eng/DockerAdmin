import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./server.js";

test("POST /api/contracts/auth/login returns a standardized 422 when the request body exceeds the generic body limit", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      payload: JSON.stringify({
        email: "admin@example.com",
        password: "x".repeat(1_100_000),
      }),
      url: "/api/contracts/auth/login",
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body exceeds the maximum allowed size",
      },
    });
  } finally {
    await app.close();
  }
});
