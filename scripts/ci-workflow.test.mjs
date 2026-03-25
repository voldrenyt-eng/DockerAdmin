import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Actions CI workflow exists and runs pull_request lint/typecheck/test checks", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /^name:\s*CI$/m);
  assert.match(workflow, /^on:\s*\n\s*pull_request:\s*$/m);
  assert.match(workflow, /^\s*node-version:\s*24\s*$/m);
  assert.match(workflow, /^\s*version:\s*10\.6\.0\s*$/m);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm lint/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/shared test/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/api test/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/web test/);
});

test("GitHub Actions CI workflow has a separate build job that runs after checks", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /^\s*build:\s*$/m);
  assert.match(workflow, /^\s*needs:\s*checks\s*$/m);
  assert.match(workflow, /pnpm build/);
});

test("GitHub Actions CI workflow has an infra smoke job that validates compose and Prisma after build", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /^\s*infra-smoke:\s*$/m);
  assert.match(workflow, /^\s*needs:\s*build\s*$/m);
  assert.match(workflow, /cp \.env\.example \.env/);
  assert.match(workflow, /pnpm docker:platform:config/);
  assert.match(workflow, /pnpm db:validate/);
  assert.match(workflow, /pnpm db:generate/);
  assert.match(workflow, /pnpm db:migrate/);
});
