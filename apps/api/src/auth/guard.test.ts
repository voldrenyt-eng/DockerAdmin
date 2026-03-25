import assert from "node:assert/strict";
import test from "node:test";

import { createAdminGuard } from "./guard.js";

test("createAdminGuard stores the current user on the request for a valid bearer token", async () => {
  const currentUser = {
    email: "admin@example.com",
    id: "user_admin",
    role: "ADMIN" as const,
  };
  const request = {
    headers: {
      authorization: "Bearer valid-access-token",
    },
  };
  const authService = {
    async getCurrentUser(accessToken: string) {
      assert.equal(accessToken, "valid-access-token");

      return currentUser;
    },
  };

  const guard = createAdminGuard(authService);
  const runGuard = guard as unknown as (
    request: never,
    reply: never,
  ) => Promise<void>;

  await runGuard(request as never, {} as never);

  assert.deepEqual(
    (request as { currentUser?: unknown }).currentUser,
    currentUser,
  );
});

test("createAdminGuard throws a standardized 401 when the bearer token is missing", async () => {
  const request = {
    headers: {},
  };
  const authService = {
    async getCurrentUser() {
      throw new Error("should not be called");
    },
  };

  const guard = createAdminGuard(authService);
  const runGuard = guard as unknown as (
    request: never,
    reply: never,
  ) => Promise<void>;

  await assert.rejects(
    async () => {
      await runGuard(request as never, {} as never);
    },
    {
      code: "UNAUTHORIZED",
      message: "Authentication required",
      statusCode: 401,
    },
  );
});
