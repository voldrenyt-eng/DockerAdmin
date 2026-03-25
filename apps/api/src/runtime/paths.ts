import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

export type ProjectRuntimeLayout = {
  deployDir: string;
  deployLogFile: string;
  envFile: string;
  projectRoot: string;
  repoDir: string;
  srcDir: string;
};

export type RuntimePaths = {
  dataRoot: string;
  ensureProjectRuntimeLayout: (
    projectId: string,
  ) => Promise<ProjectRuntimeLayout>;
  getProjectDeployDir: (projectId: string) => string;
  getProjectDeployLogFile: (projectId: string) => string;
  getProjectEnvFile: (projectId: string) => string;
  getProjectRepoDir: (projectId: string) => string;
  getProjectRoot: (projectId: string) => string;
  getProjectSrcDir: (projectId: string) => string;
  projectsRoot: string;
};

type CreateRuntimePathsOptions = {
  dataRoot: string;
};

const OUTSIDE_DATA_ROOT_ERROR_MESSAGE =
  "Resolved path points outside the configured data root";

const assertWithinRoot = (root: string, candidate: string): string => {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);

  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw new Error(OUTSIDE_DATA_ROOT_ERROR_MESSAGE);
  }

  return normalizedCandidate;
};

const resolveWithinRoot = (root: string, ...segments: string[]): string => {
  return assertWithinRoot(root, resolve(root, ...segments));
};

export const createRuntimePaths = ({
  dataRoot,
}: CreateRuntimePathsOptions): RuntimePaths => {
  const normalizedDataRoot = resolve(dataRoot);
  const projectsRoot = resolveWithinRoot(normalizedDataRoot, "projects");

  const getProjectRoot = (projectId: string): string =>
    resolveWithinRoot(projectsRoot, projectId);

  const getProjectSrcDir = (projectId: string): string =>
    resolveWithinRoot(getProjectRoot(projectId), "src");

  const getProjectRepoDir = (projectId: string): string =>
    resolveWithinRoot(getProjectRoot(projectId), "repo");

  const getProjectDeployDir = (projectId: string): string =>
    resolveWithinRoot(getProjectRoot(projectId), "deploy");

  const getProjectEnvFile = (projectId: string): string =>
    resolveWithinRoot(getProjectRoot(projectId), "env.enc");

  const getProjectDeployLogFile = (projectId: string): string =>
    resolveWithinRoot(getProjectDeployDir(projectId), "last-deploy.log");

  const ensureProjectRuntimeLayout = async (
    projectId: string,
  ): Promise<ProjectRuntimeLayout> => {
    const layout = {
      deployDir: getProjectDeployDir(projectId),
      deployLogFile: getProjectDeployLogFile(projectId),
      envFile: getProjectEnvFile(projectId),
      projectRoot: getProjectRoot(projectId),
      repoDir: getProjectRepoDir(projectId),
      srcDir: getProjectSrcDir(projectId),
    } satisfies ProjectRuntimeLayout;

    await mkdir(layout.projectRoot, { recursive: true });
    await mkdir(layout.srcDir, { recursive: true });
    await mkdir(layout.repoDir, { recursive: true });
    await mkdir(layout.deployDir, { recursive: true });

    return layout;
  };

  return {
    dataRoot: normalizedDataRoot,
    ensureProjectRuntimeLayout,
    getProjectDeployDir,
    getProjectDeployLogFile,
    getProjectEnvFile,
    getProjectRepoDir,
    getProjectRoot,
    getProjectSrcDir,
    projectsRoot,
  };
};
