import type { DeploymentDto } from "@dockeradmin/shared";

export const projectDeploymentHistoryLimit = 5;

export const getRecentProjectDeployments = (
  deployments: readonly DeploymentDto[],
  limit = projectDeploymentHistoryLimit,
): DeploymentDto[] => {
  return deployments.slice(0, Math.max(0, limit));
};

export const getLatestProjectDeployment = (
  deployments: readonly DeploymentDto[],
): DeploymentDto | null => {
  return deployments[0] ?? null;
};

export const hasRunningProjectDeployment = (
  deployments: readonly DeploymentDto[],
): boolean => {
  return getLatestProjectDeployment(deployments)?.status === "RUNNING";
};
