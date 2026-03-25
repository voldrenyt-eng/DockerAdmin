import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root package scripts expose runtime compose config, up, and down commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(
    packageJson.scripts?.["docker:runtime:config"],
    "docker compose --env-file .env -f infra/docker-compose.runtime.yml config",
  );
  assert.equal(
    packageJson.scripts?.["docker:runtime:up"],
    "docker compose --env-file .env -f infra/docker-compose.runtime.yml up -d",
  );
  assert.equal(
    packageJson.scripts?.["docker:runtime:down"],
    "docker compose --env-file .env -f infra/docker-compose.runtime.yml down",
  );
});

test(".env.example documents GHCR runtime owner and image tag inputs", async () => {
  const envExample = await readFile(".env.example", "utf8");

  assert.match(envExample, /^GHCR_OWNER=dockeradminorg$/m);
  assert.match(envExample, /^IMAGE_TAG=v0\.2\.0$/m);
});

test("runtime compose uses explicit versioned GHCR images for api and web without local builds", async () => {
  const runtimeCompose = await readFile(
    "infra/docker-compose.runtime.yml",
    "utf8",
  );

  assert.match(runtimeCompose, /^name:\s*dockeradmin$/m);
  assert.match(
    runtimeCompose,
    /image:\s*ghcr\.io\/\$\{GHCR_OWNER:\?GHCR_OWNER is required\}\/dockeradmin-api:\$\{IMAGE_TAG:\?IMAGE_TAG is required\}/,
  );
  assert.match(
    runtimeCompose,
    /image:\s*ghcr\.io\/\$\{GHCR_OWNER:\?GHCR_OWNER is required\}\/dockeradmin-web:\$\{IMAGE_TAG:\?IMAGE_TAG is required\}/,
  );
  assert.doesNotMatch(
    runtimeCompose,
    /api:\s*\n(?:.*\n)*?\s*build:/m,
  );
  assert.doesNotMatch(
    runtimeCompose,
    /web:\s*\n(?:.*\n)*?\s*build:/m,
  );
});
