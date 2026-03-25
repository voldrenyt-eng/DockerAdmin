import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const writeJson = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

test("assertValidReleaseVersion accepts strict semver and rejects invalid versions", async () => {
  const { assertValidReleaseVersion } = await import("./release-version.mjs");

  assert.equal(assertValidReleaseVersion("0.2.0"), "0.2.0");
  assert.throws(() => assertValidReleaseVersion("v0.2.0"), /strict semver/i);
  assert.throws(() => assertValidReleaseVersion("0.2"), /strict semver/i);
  assert.throws(() => assertValidReleaseVersion("latest"), /strict semver/i);
});

test("syncWorkspacePackageVersions updates the root, api, web, and shared package versions together", async () => {
  const { syncWorkspacePackageVersions } = await import("./release-version.mjs");
  const workspaceRoot = await mkdtemp(join(tmpdir(), "dockeradmin-release-"));

  await mkdir(join(workspaceRoot, "apps/api"), { recursive: true });
  await mkdir(join(workspaceRoot, "apps/web"), { recursive: true });
  await mkdir(join(workspaceRoot, "packages/shared"), { recursive: true });

  await writeJson(join(workspaceRoot, "package.json"), {
    name: "dockeradmin",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "apps/api/package.json"), {
    name: "@dockeradmin/api",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "apps/web/package.json"), {
    name: "@dockeradmin/web",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "packages/shared/package.json"), {
    name: "@dockeradmin/shared",
    version: "0.1.0",
  });

  await syncWorkspacePackageVersions({
    rootDir: workspaceRoot,
    version: "0.2.0",
  });

  assert.equal(
    JSON.parse(await readFile(join(workspaceRoot, "package.json"), "utf8"))
      .version,
    "0.2.0",
  );
  assert.equal(
    JSON.parse(
      await readFile(join(workspaceRoot, "apps/api/package.json"), "utf8"),
    ).version,
    "0.2.0",
  );
  assert.equal(
    JSON.parse(
      await readFile(join(workspaceRoot, "apps/web/package.json"), "utf8"),
    ).version,
    "0.2.0",
  );
  assert.equal(
    JSON.parse(
      await readFile(join(workspaceRoot, "packages/shared/package.json"), "utf8"),
    ).version,
    "0.2.0",
  );
});

test("syncWorkspacePackageVersions rejects a requested version equal to the current root version", async () => {
  const { syncWorkspacePackageVersions } = await import("./release-version.mjs");
  const workspaceRoot = await mkdtemp(join(tmpdir(), "dockeradmin-release-"));

  await mkdir(join(workspaceRoot, "apps/api"), { recursive: true });
  await mkdir(join(workspaceRoot, "apps/web"), { recursive: true });
  await mkdir(join(workspaceRoot, "packages/shared"), { recursive: true });

  await writeJson(join(workspaceRoot, "package.json"), {
    name: "dockeradmin",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "apps/api/package.json"), {
    name: "@dockeradmin/api",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "apps/web/package.json"), {
    name: "@dockeradmin/web",
    version: "0.1.0",
  });
  await writeJson(join(workspaceRoot, "packages/shared/package.json"), {
    name: "@dockeradmin/shared",
    version: "0.1.0",
  });

  await assert.rejects(
    () =>
      syncWorkspacePackageVersions({
        rootDir: workspaceRoot,
        version: "0.1.0",
      }),
    /must differ from the current version/i,
  );
});
