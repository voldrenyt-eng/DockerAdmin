import assert from "node:assert/strict";
import test from "node:test";

import type { AuthDto } from "@dockeradmin/shared";

import {
  dashboardRoutePath,
  loginRoutePath,
  resolveProtectedRouteRedirect,
  resolvePublicRouteRedirect,
  resolveUnknownRouteRedirect,
} from "./auth-routing.js";

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

test("resolveProtectedRouteRedirect sends guests to /login and allows authenticated access", () => {
  assert.equal(resolveProtectedRouteRedirect(null), loginRoutePath);
  assert.equal(resolveProtectedRouteRedirect(createAuthFixture()), null);
});

test("resolvePublicRouteRedirect keeps guests on /login and sends authenticated users to /", () => {
  assert.equal(resolvePublicRouteRedirect(null), null);
  assert.equal(
    resolvePublicRouteRedirect(createAuthFixture()),
    dashboardRoutePath,
  );
});

test("resolveUnknownRouteRedirect chooses the right fallback target from auth state", () => {
  assert.equal(resolveUnknownRouteRedirect(null), loginRoutePath);
  assert.equal(
    resolveUnknownRouteRedirect(createAuthFixture()),
    dashboardRoutePath,
  );
});
