import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { appErrors } from "../errors.js";
import type { ProjectRecord } from "../projects/repository.js";
import type { RuntimePaths } from "../runtime/paths.js";

export const SUPPORTED_COMPOSE_FILE_NAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const;

export const COMPOSE_FILE_NOT_FOUND_MESSAGE = "Compose file not found";
export const COMPOSE_FILE_AMBIGUOUS_MESSAGE =
  "Multiple compose files found in the project source root";

export type SupportedComposeFileName =
  (typeof SUPPORTED_COMPOSE_FILE_NAMES)[number];

export type ProjectWorkingSource = {
  sourceType: ProjectRecord["sourceType"];
  workingDir: string;
};

export type ResolvedProjectComposeFile = ProjectWorkingSource & {
  composeFileName: SupportedComposeFileName;
  composeFilePath: string;
};

type ResolveProjectWorkingSourceOptions = {
  project: Pick<ProjectRecord, "id" | "sourceType">;
  runtimePaths: Pick<RuntimePaths, "getProjectRepoDir" | "getProjectSrcDir">;
};

const isSupportedComposeFileName = (
  value: string,
): value is SupportedComposeFileName => {
  return SUPPORTED_COMPOSE_FILE_NAMES.includes(
    value as SupportedComposeFileName,
  );
};

export const resolveProjectWorkingSource = async ({
  project,
  runtimePaths,
}: ResolveProjectWorkingSourceOptions): Promise<ProjectWorkingSource> => {
  return {
    sourceType: project.sourceType,
    workingDir:
      project.sourceType === "git"
        ? runtimePaths.getProjectRepoDir(project.id)
        : runtimePaths.getProjectSrcDir(project.id),
  };
};

export const resolveProjectComposeFile = async (
  options: ResolveProjectWorkingSourceOptions,
): Promise<ResolvedProjectComposeFile> => {
  const workingSource = await resolveProjectWorkingSource(options);
  let rootEntries: Array<{
    isFile: () => boolean;
    name: string;
  }>;

  try {
    rootEntries = await readdir(workingSource.workingDir, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw appErrors.validation(COMPOSE_FILE_NOT_FOUND_MESSAGE);
    }

    throw error;
  }

  const composeFileNames: SupportedComposeFileName[] = [];

  for (const entry of rootEntries) {
    if (entry.isFile() && isSupportedComposeFileName(entry.name)) {
      composeFileNames.push(entry.name);
    }
  }

  if (composeFileNames.length === 0) {
    throw appErrors.validation(COMPOSE_FILE_NOT_FOUND_MESSAGE);
  }

  if (composeFileNames.length > 1) {
    throw appErrors.validation(COMPOSE_FILE_AMBIGUOUS_MESSAGE);
  }

  const composeFileName = composeFileNames[0];

  if (!composeFileName) {
    throw appErrors.validation(COMPOSE_FILE_NOT_FOUND_MESSAGE);
  }

  return {
    composeFileName,
    composeFilePath: join(workingSource.workingDir, composeFileName),
    ...workingSource,
  };
};
