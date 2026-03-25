import assert from "node:assert/strict";
import test from "node:test";

import { createApiConfig } from "./config.js";

test("createApiConfig returns normalized values when critical env vars are present", () => {
  const config = createApiConfig({
    DATABASE_URL:
      "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
    ENV_ENCRYPTION_KEY: "dockeradmin-dev-encryption-key",
    JWT_ACCESS_SECRET: "dockeradmin-access-secret",
    JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
  });

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3001);
  assert.equal(config.dataRoot, "data");
  assert.equal(config.deployTimeoutMs, 300000);
  assert.equal(config.webOrigin, "http://localhost:5173");
  assert.equal(
    config.databaseUrl,
    "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
  );
});

test("createApiConfig throws a readable error when ENV_ENCRYPTION_KEY is missing", () => {
  assert.throws(
    () =>
      createApiConfig({
        DATABASE_URL:
          "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
        JWT_ACCESS_SECRET: "dockeradmin-access-secret",
        JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
      }),
    /ENV_ENCRYPTION_KEY/,
  );
});

test("createApiConfig treats empty optional telegram vars as undefined", () => {
  const config = createApiConfig({
    DATABASE_URL:
      "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
    ENV_ENCRYPTION_KEY: "dockeradmin-dev-encryption-key",
    JWT_ACCESS_SECRET: "dockeradmin-access-secret",
    JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
  });

  assert.equal(config.telegramBotToken, undefined);
  assert.equal(config.telegramChatId, undefined);
});

test("createApiConfig returns a custom DATA_ROOT when provided", () => {
  const config = createApiConfig({
    DATABASE_URL:
      "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
    DATA_ROOT: "/srv/dockeradmin-data",
    ENV_ENCRYPTION_KEY: "dockeradmin-dev-encryption-key",
    JWT_ACCESS_SECRET: "dockeradmin-access-secret",
    JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
  });

  assert.equal(config.dataRoot, "/srv/dockeradmin-data");
});

test("createApiConfig returns a custom DEPLOY_TIMEOUT_MS when provided", () => {
  const config = createApiConfig({
    DATABASE_URL:
      "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
    DEPLOY_TIMEOUT_MS: "45000",
    ENV_ENCRYPTION_KEY: "dockeradmin-dev-encryption-key",
    JWT_ACCESS_SECRET: "dockeradmin-access-secret",
    JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
  });

  assert.equal(config.deployTimeoutMs, 45000);
});

test("createApiConfig normalizes a custom WEB_ORIGIN down to its origin", () => {
  const config = createApiConfig({
    DATABASE_URL:
      "postgresql://dockeradmin:dockeradmin-dev@localhost:5432/dockeradmin?schema=public",
    ENV_ENCRYPTION_KEY: "dockeradmin-dev-encryption-key",
    JWT_ACCESS_SECRET: "dockeradmin-access-secret",
    JWT_REFRESH_SECRET: "dockeradmin-refresh-secret",
    WEB_ORIGIN: "https://portal.example.com/admin/login?next=%2Fprojects",
  });

  assert.equal(config.webOrigin, "https://portal.example.com");
});
