import assert from "node:assert/strict";
import test from "node:test";

import type { AuthDto } from "@dockeradmin/shared";

import {
  authSessionStorageKey,
  clearStoredAuthSession,
  loginWithPassword,
  logoutAuthSession,
  readStoredAuthSession,
  refreshAuthSession,
  writeStoredAuthSession,
} from "./auth.js";

const createAuthFixture = (): AuthDto => ({
  tokens: {
    accessToken: "access_token_1",
    refreshToken: "refresh_token_1",
  },
  user: {
    email: "admin@example.com",
    id: "user_admin",
    role: "ADMIN",
  },
});

test("readStoredAuthSession restores a saved auth payload and write/clear keep storage in sync", () => {
  const writes = new Map<string, string>();
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, authSessionStorageKey);

      return JSON.stringify(createAuthFixture());
    },
    removeItem: (key: string) => {
      writes.set(`remove:${key}`, "");
    },
    setItem: (key: string, value: string) => {
      writes.set(key, value);
    },
  };

  assert.deepEqual(readStoredAuthSession(storage), createAuthFixture());

  writeStoredAuthSession(storage, createAuthFixture());
  clearStoredAuthSession(storage);

  assert.equal(
    writes.get(authSessionStorageKey),
    JSON.stringify(createAuthFixture()),
  );
  assert.equal(writes.has(`remove:${authSessionStorageKey}`), true);
});

test("loginWithPassword posts credentials to the auth login endpoint and parses the shared auth payload", async () => {
  const seenRequests: Array<{
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  const result = await loginWithPassword({
    apiBaseUrl: "http://localhost:3001",
    email: "admin@example.com",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(JSON.stringify(createAuthFixture()), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    password: "AdminPass123!",
  });

  assert.deepEqual(seenRequests, [
    {
      method: "POST",
      payload: {
        email: "admin@example.com",
        password: "AdminPass123!",
      },
      url: "http://localhost:3001/api/auth/login",
    },
  ]);
  assert.deepEqual(result, createAuthFixture());
});

test("refreshAuthSession posts the refresh token and parses the rotated auth payload", async () => {
  const seenRequests: Array<{
    method: string;
    payload: unknown;
    url: string;
  }> = [];
  const rotatedAuth = {
    ...createAuthFixture(),
    tokens: {
      accessToken: "access_token_2",
      refreshToken: "refresh_token_2",
    },
  } satisfies AuthDto;

  const result = await refreshAuthSession({
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(JSON.stringify(rotatedAuth), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    refreshToken: "refresh_token_1",
  });

  assert.deepEqual(seenRequests, [
    {
      method: "POST",
      payload: {
        refreshToken: "refresh_token_1",
      },
      url: "http://localhost:3001/api/auth/refresh",
    },
  ]);
  assert.deepEqual(result, rotatedAuth);
});

test("logoutAuthSession posts the current refresh token to the logout endpoint", async () => {
  const seenRequests: Array<{
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  await logoutAuthSession({
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(null, {
        status: 204,
      });
    },
    refreshToken: "refresh_token_1",
  });

  assert.deepEqual(seenRequests, [
    {
      method: "POST",
      payload: {
        refreshToken: "refresh_token_1",
      },
      url: "http://localhost:3001/api/auth/logout",
    },
  ]);
});
