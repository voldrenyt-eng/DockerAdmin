import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AppError } from "../errors.js";
import type { ProjectRecord } from "../projects/repository.js";
import { createRuntimePaths } from "../runtime/paths.js";
import {
  COMPOSE_FILE_AMBIGUOUS_MESSAGE,
  COMPOSE_FILE_NOT_FOUND_MESSAGE,
  resolveProjectComposeFile,
  resolveProjectWorkingSource,
} from "./compose.js";

const createProjectRecord = (
  sourceType: ProjectRecord["sourceType"],
): ProjectRecord => ({
  createdAt: new Date("2026-03-19T11:00:00.000Z"),
  id: `project_${sourceType}`,
  name: `Project ${sourceType}`,
  slug: `project-${sourceType}`,
  sourceType,
  updatedAt: new Date("2026-03-19T11:00:00.000Z"),
});

test("resolveProjectWorkingSource uses the src workspace for ZIP projects", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-compose-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const project = createProjectRecord("zip");

  try {
    const resolved = await resolveProjectWorkingSource({
      project,
      runtimePaths,
    });

    assert.deepEqual(resolved, {
      sourceType: "zip",
      workingDir: runtimePaths.getProjectSrcDir(project.id),
    });
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("resolveProjectWorkingSource uses the repo workspace for Git projects", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-compose-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const project = createProjectRecord("git");

  try {
    const resolved = await resolveProjectWorkingSource({
      project,
      runtimePaths,
    });

    assert.deepEqual(resolved, {
      sourceType: "git",
      workingDir: runtimePaths.getProjectRepoDir(project.id),
    });
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("resolveProjectComposeFile returns the supported compose file from the working source root", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-compose-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const project = createProjectRecord("zip");

  try {
    await runtimePaths.ensureProjectRuntimeLayout(project.id);
    const composeFilePath = join(
      runtimePaths.getProjectSrcDir(project.id),
      "docker-compose.yml",
    );

    writeFileSync(
      composeFilePath,
      "services:\n  app:\n    image: nginx:1.27\n",
    );

    const resolved = await resolveProjectComposeFile({
      project,
      runtimePaths,
    });

    assert.deepEqual(resolved, {
      composeFileName: "docker-compose.yml",
      composeFilePath,
      sourceType: "zip",
      workingDir: runtimePaths.getProjectSrcDir(project.id),
    });
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("resolveProjectComposeFile ignores nested compose files and returns a readable validation error when none exist at the root", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-compose-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const project = createProjectRecord("zip");

  try {
    await runtimePaths.ensureProjectRuntimeLayout(project.id);
    const nestedDir = join(runtimePaths.getProjectSrcDir(project.id), "nested");

    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, "docker-compose.yml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );

    await assert.rejects(
      () =>
        resolveProjectComposeFile({
          project,
          runtimePaths,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.equal(error.message, COMPOSE_FILE_NOT_FOUND_MESSAGE);

        return true;
      },
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("resolveProjectComposeFile returns a readable validation error when multiple root compose files exist", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-compose-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const project = createProjectRecord("git");

  try {
    await runtimePaths.ensureProjectRuntimeLayout(project.id);
    const repoDir = runtimePaths.getProjectRepoDir(project.id);

    writeFileSync(
      join(repoDir, "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    writeFileSync(
      join(repoDir, "docker-compose.yml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );

    await assert.rejects(
      () =>
        resolveProjectComposeFile({
          project,
          runtimePaths,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.equal(error.message, COMPOSE_FILE_AMBIGUOUS_MESSAGE);

        return true;
      },
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});
