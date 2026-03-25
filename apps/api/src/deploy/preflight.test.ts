import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ENV_DECRYPT_FAILED_MESSAGE,
  encryptEnvContent,
} from "../env/service.js";
import { AppError } from "../errors.js";
import {
  type ProjectRecord,
  createProjectRepository,
} from "../projects/repository.js";
import { createRuntimePaths } from "../runtime/paths.js";
import { COMPOSE_FILE_NOT_FOUND_MESSAGE } from "./compose.js";
import {
  DOCKER_DAEMON_UNAVAILABLE_MESSAGE,
  WORKING_SOURCE_NOT_FOUND_MESSAGE,
  createDeployPreflightService,
} from "./preflight.js";

const ENV_ENCRYPTION_KEY = "test-env-encryption-key";

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

const createDeployPreflightContext = (project?: ProjectRecord) => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-preflight-"));
  const runtimePaths = createRuntimePaths({ dataRoot });
  const projectRepository = createProjectRepository(
    project ? { projects: [project] } : {},
  );

  return {
    dataRoot,
    projectRepository,
    runtimePaths,
  };
};

test("preflightProjectDeploy returns the resolved working source, compose file, and env state for a valid project", async () => {
  const project = createProjectRecord("git");
  const context = createDeployPreflightContext(project);
  let dockerChecks = 0;

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(context.runtimePaths.getProjectRepoDir(project.id), "compose.yaml"),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    writeFileSync(
      context.runtimePaths.getProjectEnvFile(project.id),
      encryptEnvContent({
        content: "TOKEN=secret-value\n",
        envEncryptionKey: ENV_ENCRYPTION_KEY,
      }),
      "utf8",
    );
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => {
        dockerChecks += 1;
      },
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    const result = await preflightService.preflightProjectDeploy({
      projectId: project.id,
    });

    assert.equal(dockerChecks, 1);
    assert.deepEqual(result, {
      composeFileName: "compose.yaml",
      composeFilePath: join(
        context.runtimePaths.getProjectRepoDir(project.id),
        "compose.yaml",
      ),
      hasEncryptedEnv: true,
      projectId: project.id,
      projectSlug: project.slug,
      sourceType: "git",
      workingDir: context.runtimePaths.getProjectRepoDir(project.id),
    });
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("preflightProjectDeploy returns a standardized 404 when the project is missing", async () => {
  const context = createDeployPreflightContext();

  try {
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => undefined,
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    await assert.rejects(
      () =>
        preflightService.preflightProjectDeploy({
          projectId: "project_missing",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.message, "Project not found");

        return true;
      },
    );
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("preflightProjectDeploy returns a standardized 404 when the working source directory is missing", async () => {
  const project = createProjectRecord("zip");
  const context = createDeployPreflightContext(project);

  try {
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => undefined,
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    await assert.rejects(
      () =>
        preflightService.preflightProjectDeploy({
          projectId: project.id,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.message, WORKING_SOURCE_NOT_FOUND_MESSAGE);

        return true;
      },
    );
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("preflightProjectDeploy keeps the readable compose validation error when the working source has no root compose file", async () => {
  const project = createProjectRecord("zip");
  const context = createDeployPreflightContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => undefined,
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    await assert.rejects(
      () =>
        preflightService.preflightProjectDeploy({
          projectId: project.id,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.equal(error.message, COMPOSE_FILE_NOT_FOUND_MESSAGE);

        return true;
      },
    );
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("preflightProjectDeploy returns a controlled 500 when Docker daemon is unavailable", async () => {
  const project = createProjectRecord("zip");
  const context = createDeployPreflightContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => {
        throw new Error("connect ENOENT /var/run/docker.sock");
      },
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    await assert.rejects(
      () =>
        preflightService.preflightProjectDeploy({
          projectId: project.id,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "INTERNAL_ERROR");
        assert.equal(error.message, DOCKER_DAEMON_UNAVAILABLE_MESSAGE);

        return true;
      },
    );
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("preflightProjectDeploy fails safely when env.enc exists but cannot be decrypted", async () => {
  const project = createProjectRecord("zip");
  const context = createDeployPreflightContext(project);

  try {
    await context.runtimePaths.ensureProjectRuntimeLayout(project.id);
    writeFileSync(
      join(
        context.runtimePaths.getProjectSrcDir(project.id),
        "docker-compose.yml",
      ),
      "services:\n  app:\n    image: nginx:1.27\n",
    );
    writeFileSync(
      context.runtimePaths.getProjectEnvFile(project.id),
      "not-a-valid-envelope",
      "utf8",
    );
    const preflightService = createDeployPreflightService({
      checkDockerDaemon: async () => undefined,
      envEncryptionKey: ENV_ENCRYPTION_KEY,
      projectRepository: context.projectRepository,
      runtimePaths: context.runtimePaths,
    });

    await assert.rejects(
      () =>
        preflightService.preflightProjectDeploy({
          projectId: project.id,
        }),
      {
        message: ENV_DECRYPT_FAILED_MESSAGE,
      },
    );
  } finally {
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});
