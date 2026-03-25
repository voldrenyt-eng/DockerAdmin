import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

import {
  ENV_DECRYPT_FAILED_MESSAGE,
  decryptEnvContent,
} from "../env/service.js";
import { AppError, appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import type { RuntimePaths } from "../runtime/paths.js";
import {
  type ResolvedProjectComposeFile,
  resolveProjectComposeFile,
  resolveProjectWorkingSource,
} from "./compose.js";

export const DOCKER_DAEMON_UNAVAILABLE_MESSAGE =
  "Docker daemon is not available";
export const WORKING_SOURCE_NOT_FOUND_MESSAGE =
  "Project working source not found";
export const DOCKER_INFO_TIMEOUT_MS = 5_000;

const execFileAsync = promisify(execFile);

type DeployPreflightServiceOptions = {
  checkDockerDaemon?: () => Promise<void>;
  envEncryptionKey: string;
  projectRepository: Pick<ProjectRepository, "findProjectById">;
  runtimePaths: Pick<
    RuntimePaths,
    "getProjectEnvFile" | "getProjectRepoDir" | "getProjectSrcDir"
  >;
};

export type DeployPreflightResult = ResolvedProjectComposeFile & {
  hasEncryptedEnv: boolean;
  projectId: string;
  projectSlug: string;
};

export type DeployPreflightService = {
  preflightProjectDeploy: (input: {
    projectId: string;
  }) => Promise<DeployPreflightResult>;
};

const defaultDockerDaemonCheck = async (): Promise<void> => {
  try {
    await execFileAsync("docker", ["info"], {
      timeout: DOCKER_INFO_TIMEOUT_MS,
    });
  } catch (_error) {
    throw new AppError("INTERNAL_ERROR", DOCKER_DAEMON_UNAVAILABLE_MESSAGE);
  }
};

const assertWorkingSourceExists = async (workingDir: string): Promise<void> => {
  try {
    const workingSourceStat = await stat(workingDir);

    if (!workingSourceStat.isDirectory()) {
      throw appErrors.notFound(WORKING_SOURCE_NOT_FOUND_MESSAGE);
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw appErrors.notFound(WORKING_SOURCE_NOT_FOUND_MESSAGE);
    }

    throw error;
  }
};

const resolveEncryptedEnvState = async (input: {
  envEncryptionKey: string;
  projectId: string;
  runtimePaths: Pick<RuntimePaths, "getProjectEnvFile">;
}): Promise<boolean> => {
  try {
    const encryptedContent = await readFile(
      input.runtimePaths.getProjectEnvFile(input.projectId),
      "utf8",
    );

    decryptEnvContent({
      encryptedContent,
      envEncryptionKey: input.envEncryptionKey,
    });

    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    if (
      error instanceof Error &&
      error.message === ENV_DECRYPT_FAILED_MESSAGE
    ) {
      throw error;
    }

    throw error;
  }
};

export const createDeployPreflightService = ({
  checkDockerDaemon = defaultDockerDaemonCheck,
  envEncryptionKey,
  projectRepository,
  runtimePaths,
}: DeployPreflightServiceOptions): DeployPreflightService => ({
  async preflightProjectDeploy({ projectId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const workingSource = await resolveProjectWorkingSource({
      project,
      runtimePaths,
    });

    await assertWorkingSourceExists(workingSource.workingDir);

    const composeFile = await resolveProjectComposeFile({
      project,
      runtimePaths,
    });

    try {
      await checkDockerDaemon();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("INTERNAL_ERROR", DOCKER_DAEMON_UNAVAILABLE_MESSAGE);
    }

    const hasEncryptedEnv = await resolveEncryptedEnvState({
      envEncryptionKey,
      projectId,
      runtimePaths,
    });

    return {
      ...composeFile,
      hasEncryptedEnv,
      projectId: project.id,
      projectSlug: project.slug,
    };
  },
});
