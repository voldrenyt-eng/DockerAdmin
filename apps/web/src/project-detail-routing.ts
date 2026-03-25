export const projectsRoutePath = "/projects";
export const projectDetailTabs = [
  "services",
  "logs",
  "domains",
  "deployments",
  "env",
] as const;

export type ProjectDetailTabKey = (typeof projectDetailTabs)[number];

export const defaultProjectDetailTab: ProjectDetailTabKey = "services";
export const projectDetailBaseRoutePattern = `${projectsRoutePath}/:projectId`;
export const projectDetailTabRoutePattern = `${projectDetailBaseRoutePattern}/:tab`;

export const isProjectDetailTab = (
  value: string | undefined,
): value is ProjectDetailTabKey => {
  return projectDetailTabs.some((tab) => tab === value);
};

export const resolveProjectDetailTab = (
  value: string | undefined,
): ProjectDetailTabKey => {
  return isProjectDetailTab(value) ? value : defaultProjectDetailTab;
};

export const createProjectDetailPath = (
  projectId: string,
  tab: ProjectDetailTabKey = defaultProjectDetailTab,
): string => {
  return `${projectsRoutePath}/${encodeURIComponent(projectId)}/${tab}`;
};
