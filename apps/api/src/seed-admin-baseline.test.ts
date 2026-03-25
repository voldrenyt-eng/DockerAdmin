import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(path.dirname(currentFilePath), "..");
const repoRoot = path.resolve(apiRoot, "..", "..");

test("root and api packages expose seed commands", () => {
  const rootPackageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };
  const apiPackageJson = JSON.parse(
    readFileSync(path.join(apiRoot, "package.json"), "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(typeof rootPackageJson.scripts?.["db:seed"], "string");
  assert.equal(typeof apiPackageJson.scripts?.["db:seed"], "string");
});

test("env example declares the seed admin credentials", () => {
  const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

  assert.match(envExample, /^SEED_ADMIN_EMAIL=/m);
  assert.match(envExample, /^SEED_ADMIN_PASSWORD=/m);
});

test("Prisma seed script exists", () => {
  assert.equal(existsSync(path.join(apiRoot, "prisma", "seed.ts")), true);
});
