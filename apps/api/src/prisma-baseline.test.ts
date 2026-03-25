import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(path.dirname(currentFilePath), "..");
const prismaRoot = path.join(apiRoot, "prisma");

test("api package exposes the Prisma migration scripts", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(apiRoot, "package.json"), "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(typeof packageJson.scripts?.["db:generate"], "string");
  assert.equal(typeof packageJson.scripts?.["db:migrate"], "string");
  assert.equal(typeof packageJson.scripts?.["db:migrate:deploy"], "string");
});

test("Prisma schema defines the required MVP models", () => {
  const schemaPath = path.join(prismaRoot, "schema.prisma");

  assert.equal(existsSync(schemaPath), true);

  const schema = readFileSync(schemaPath, "utf8");

  for (const modelName of [
    "User",
    "RefreshToken",
    "Project",
    "Deployment",
    "Domain",
    "AuditLog",
  ]) {
    assert.match(schema, new RegExp(`model\\s+${modelName}\\s+\\{`));
  }

  assert.match(schema, /datasource\s+db\s+\{/);
  assert.match(schema, /provider\s+=\s+"postgresql"/);
  assert.match(schema, /generator\s+client\s+\{/);
});

test("initial Prisma migration exists", () => {
  const migrationsRoot = path.join(prismaRoot, "migrations");

  assert.equal(existsSync(migrationsRoot), true);

  const migrationDirectories = readdirSync(migrationsRoot, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory());

  assert.ok(migrationDirectories.length > 0);

  const firstMigrationDirectory = migrationDirectories[0];

  assert.ok(firstMigrationDirectory);

  const migrationSqlPath = path.join(
    migrationsRoot,
    firstMigrationDirectory.name,
    "migration.sql",
  );

  assert.equal(existsSync(migrationSqlPath), true);
});
