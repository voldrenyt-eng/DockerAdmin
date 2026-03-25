import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Actions release workflow exists and exposes a manual semver input", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /^name:\s*Release$/m);
  assert.match(workflow, /^on:\s*\n\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s*version:\s*$/m);
  assert.match(workflow, /^\s*description:\s*Explicit semver release version\s*$/m);
  assert.match(workflow, /^\s*required:\s*true\s*$/m);
  assert.match(workflow, /^\s*deploy_runtime:\s*$/m);
});

test("GitHub Actions release workflow is serialized, writes contents, and guards the default branch", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /^\s*contents:\s*write\s*$/m);
  assert.match(workflow, /^\s*packages:\s*write\s*$/m);
  assert.match(workflow, /^concurrency:\s*release$/m);
  assert.match(workflow, /^\s*fetch-depth:\s*0\s*$/m);
  assert.match(workflow, /github\.event\.repository\.default_branch/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm lint/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/shared test/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/api test/);
  assert.match(workflow, /pnpm --filter @dockeradmin\/web test/);
  assert.match(workflow, /pnpm build/);
});

test("GitHub Actions release workflow bumps versions, creates git release artifacts, and opens a draft release", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /node scripts\/release-version\.mjs/);
  assert.match(workflow, /node scripts\/release-images\.mjs/);
  assert.match(workflow, /docker\/login-action@v\d/);
  assert.match(workflow, /registry:\s*ghcr\.io/);
  assert.match(workflow, /docker\/build-push-action@v\d/);
  assert.match(workflow, /dockeradmin-api/);
  assert.match(workflow, /dockeradmin-web/);
  assert.match(workflow, /chore\(release\): v/);
  assert.match(workflow, /git tag "?v/);
  assert.match(workflow, /^\s*deploy_runtime:\s*$/m);
  assert.match(workflow, /^\s*draft_release:\s*$/m);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /--generate-notes/);
  assert.match(workflow, /DEPLOY_RUNTIME_SSH_PRIVATE_KEY/);
  assert.match(workflow, /DEPLOY_RUNTIME_SSH_KNOWN_HOSTS/);
  assert.match(workflow, /infra\/docker-compose\.runtime\.yml/);
  assert.match(workflow, /git checkout v\$\{RELEASE_VERSION\}/);
  assert.doesNotMatch(workflow, /ssh-keyscan/);

  const ghcrLoginIndex = workflow.indexOf("docker/login-action");
  const gitPushIndex = workflow.indexOf("git push origin HEAD:${GITHUB_REF_NAME}");
  const deployJobIndex = workflow.indexOf("\n  deploy_runtime:\n    runs-on:");
  const releaseIndex = workflow.indexOf("gh release create");

  assert.notEqual(ghcrLoginIndex, -1);
  assert.notEqual(gitPushIndex, -1);
  assert.notEqual(deployJobIndex, -1);
  assert.notEqual(releaseIndex, -1);
  assert.ok(
    ghcrLoginIndex < gitPushIndex,
    "expected GHCR login before pushing the release commit and tag",
  );
  assert.ok(
    gitPushIndex < deployJobIndex,
    "expected runtime deploy job definition after the release job",
  );
  assert.ok(
    deployJobIndex < releaseIndex,
    "expected draft GitHub Release creation after the gated runtime deploy path",
  );
});
