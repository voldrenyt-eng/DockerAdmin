import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("createRuntimePaths resolves stable project runtime paths under the data root", async () => {
  const { createRuntimePaths } = await import("./paths.js");
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-runtime-"));

  try {
    const runtimePaths = createRuntimePaths({ dataRoot });

    assert.equal(runtimePaths.dataRoot, dataRoot);
    assert.equal(runtimePaths.projectsRoot, join(dataRoot, "projects"));
    assert.equal(
      runtimePaths.getProjectRoot("project_1"),
      join(dataRoot, "projects", "project_1"),
    );
    assert.equal(
      runtimePaths.getProjectSrcDir("project_1"),
      join(dataRoot, "projects", "project_1", "src"),
    );
    assert.equal(
      runtimePaths.getProjectRepoDir("project_1"),
      join(dataRoot, "projects", "project_1", "repo"),
    );
    assert.equal(
      runtimePaths.getProjectDeployDir("project_1"),
      join(dataRoot, "projects", "project_1", "deploy"),
    );
    assert.equal(
      runtimePaths.getProjectEnvFile("project_1"),
      join(dataRoot, "projects", "project_1", "env.enc"),
    );
    assert.equal(
      runtimePaths.getProjectDeployLogFile("project_1"),
      join(dataRoot, "projects", "project_1", "deploy", "last-deploy.log"),
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("createRuntimePaths blocks path traversal outside the configured data root", async () => {
  const { createRuntimePaths } = await import("./paths.js");
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-runtime-"));

  try {
    const runtimePaths = createRuntimePaths({ dataRoot });

    assert.throws(
      () => runtimePaths.getProjectRoot("../escape"),
      /outside the configured data root/,
    );
    assert.throws(
      () => runtimePaths.getProjectRoot("/tmp/escape"),
      /outside the configured data root/,
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("ensureProjectRuntimeLayout creates the required project runtime directories", async () => {
  const { createRuntimePaths } = await import("./paths.js");
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-runtime-"));

  try {
    const runtimePaths = createRuntimePaths({ dataRoot });
    const layout = await runtimePaths.ensureProjectRuntimeLayout("project_1");

    assert.ok(existsSync(layout.projectRoot));
    assert.ok(statSync(layout.projectRoot).isDirectory());
    assert.ok(statSync(layout.srcDir).isDirectory());
    assert.ok(statSync(layout.repoDir).isDirectory());
    assert.ok(statSync(layout.deployDir).isDirectory());
    assert.equal(
      layout.envFile,
      join(dataRoot, "projects", "project_1", "env.enc"),
    );
    assert.equal(
      layout.deployLogFile,
      join(dataRoot, "projects", "project_1", "deploy", "last-deploy.log"),
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});
