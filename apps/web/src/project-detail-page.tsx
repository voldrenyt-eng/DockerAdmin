import type { DeploymentDto, ProjectDto } from "@dockeradmin/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { useI18n } from "./i18n-provider";
import {
  getLatestProjectDeployment,
  getRecentProjectDeployments,
  hasRunningProjectDeployment,
} from "./project-deployments";
import {
  type ProjectDetailTabKey,
  createProjectDetailPath,
  defaultProjectDetailTab,
  isProjectDetailTab,
  projectDetailTabs,
  projectsRoutePath,
} from "./project-detail-routing";
import {
  ProjectDomainsTab,
  ProjectLogsTab,
  ProjectServicesTab,
} from "./project-runtime-tabs";
import {
  deployProject,
  getProject,
  getProjectEnv,
  listProjectDeployments,
  putProjectEnv,
} from "./projects";

type ProjectDetailPageProps = {
  accessToken: string;
  apiBaseUrl: string;
  onAccessTokenExpired?: () => Promise<string | null>;
};

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

const formatDeploymentTimestamp = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const resolveDeploymentStatusClassName = (
  status: DeploymentDto["status"] | "EMPTY",
): string => {
  switch (status) {
    case "SUCCESS":
      return "project-deployment-status-pill-success";
    case "FAILED":
      return "project-deployment-status-pill-failed";
    case "RUNNING":
      return "project-deployment-status-pill-running";
    default:
      return "project-deployment-status-pill-empty";
  }
};

const projectDetailTabMeta: Record<
  ProjectDetailTabKey,
  {
    endpoint: string;
    translationPath: string;
  }
> = {
  deployments: {
    endpoint: "GET /api/projects/:id/deployments",
    translationPath: "app.projects.detail.content.deployments",
  },
  domains: {
    endpoint: "GET /api/domains",
    translationPath: "app.projects.detail.content.domains",
  },
  env: {
    endpoint: "GET /api/projects/:id/env",
    translationPath: "app.projects.detail.content.env",
  },
  logs: {
    endpoint: "GET /api/projects/:id/logs?serviceName=&tail=",
    translationPath: "app.projects.detail.content.logs",
  },
  services: {
    endpoint: "GET /api/projects/:id/services",
    translationPath: "app.projects.detail.content.services",
  },
};

export const ProjectDetailRouteRedirect = () => {
  const { projectId } = useParams();

  if (!projectId) {
    return <Navigate replace to={projectsRoutePath} />;
  }

  return (
    <Navigate
      replace
      to={createProjectDetailPath(projectId, defaultProjectDetailTab)}
    />
  );
};

export const ProjectDetailPage = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
}: ProjectDetailPageProps) => {
  const { projectId, tab } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [envContent, setEnvContent] = useState("");
  const [envError, setEnvError] = useState<string | null>(null);
  const [envNotice, setEnvNotice] = useState<string | null>(null);
  const [isEnvLoading, setIsEnvLoading] = useState(false);
  const [isEnvSaving, setIsEnvSaving] = useState(false);
  const [loadedEnvProjectId, setLoadedEnvProjectId] = useState<string | null>(
    null,
  );
  const [deployments, setDeployments] = useState<DeploymentDto[]>([]);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);
  const [deploymentsNotice, setDeploymentsNotice] = useState<string | null>(
    null,
  );
  const [isDeploymentsLoading, setIsDeploymentsLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [loadedDeploymentsProjectId, setLoadedDeploymentsProjectId] = useState<
    string | null
  >(null);
  const normalizedProjectId = projectId?.trim() ?? "";
  const currentProjectId = project?.id ?? null;
  const activeTab = isProjectDetailTab(tab) ? tab : defaultProjectDetailTab;
  const activeTabMeta = projectDetailTabMeta[activeTab];
  const latestDeployment = getLatestProjectDeployment(deployments);
  const recentDeployments = getRecentProjectDeployments(deployments);
  const isRunningDeploymentVisible = hasRunningProjectDeployment(deployments);
  const isDeployActionDisabled = isDeploying || isRunningDeploymentVisible;

  const resetEnvState = useCallback(() => {
    setEnvContent("");
    setEnvError(null);
    setEnvNotice(null);
    setIsEnvLoading(false);
    setIsEnvSaving(false);
    setLoadedEnvProjectId(null);
  }, []);

  const resetDeploymentsState = useCallback(() => {
    setDeployments([]);
    setDeploymentsError(null);
    setDeploymentsNotice(null);
    setIsDeploymentsLoading(false);
    setIsDeploying(false);
    setLoadedDeploymentsProjectId(null);
  }, []);

  useEffect(() => {
    if (normalizedProjectId.length === 0) {
      return;
    }

    if (tab !== activeTab) {
      navigate(createProjectDetailPath(normalizedProjectId, activeTab), {
        replace: true,
      });
    }
  }, [activeTab, navigate, normalizedProjectId, tab]);

  const loadProject = useCallback(async () => {
    if (accessToken.trim().length === 0 || normalizedProjectId.length === 0) {
      setProject(null);
      setProjectError(null);
      setIsProjectLoading(false);
      resetEnvState();
      resetDeploymentsState();

      return;
    }

    setProjectError(null);
    setIsProjectLoading(true);

    try {
      const nextProject = await getProject(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId: normalizedProjectId,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId: normalizedProjectId,
            },
      );

      if (currentProjectId !== nextProject.id) {
        resetEnvState();
        resetDeploymentsState();
      }

      setProject(nextProject);
    } catch (error) {
      if (currentProjectId !== null) {
        resetEnvState();
        resetDeploymentsState();
      }

      setProject(null);
      setProjectError(
        toErrorMessage(error, t("app.projects.detail.errors.loadFallback")),
      );
    } finally {
      setIsProjectLoading(false);
    }
  }, [
    accessToken,
    apiBaseUrl,
    currentProjectId,
    normalizedProjectId,
    onAccessTokenExpired,
    resetDeploymentsState,
    resetEnvState,
    t,
  ]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const loadProjectEnv = useCallback(async () => {
    if (!project || accessToken.trim().length === 0) {
      return;
    }

    setEnvError(null);
    setEnvNotice(null);
    setIsEnvLoading(true);

    try {
      const nextEnvContent = await getProjectEnv(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId: project.id,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId: project.id,
            },
      );

      setEnvContent(nextEnvContent ?? "");
      setEnvNotice(
        nextEnvContent === null
          ? t("app.projects.detail.envEditor.emptyNotice")
          : null,
      );
      setLoadedEnvProjectId(project.id);
    } catch (error) {
      setEnvError(
        toErrorMessage(error, t("app.projects.detail.errors.loadEnvFallback")),
      );
    } finally {
      setIsEnvLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, project, t]);

  useEffect(() => {
    if (activeTab !== "env" || !project) {
      return;
    }

    if (loadedEnvProjectId === project.id) {
      return;
    }

    void loadProjectEnv();
  }, [activeTab, loadProjectEnv, loadedEnvProjectId, project]);

  const loadProjectDeployments = useCallback(async () => {
    if (!project || accessToken.trim().length === 0) {
      return;
    }

    setDeploymentsError(null);
    setDeploymentsNotice(null);
    setIsDeploymentsLoading(true);

    try {
      const nextDeployments = await listProjectDeployments(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId: project.id,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId: project.id,
            },
      );

      setDeployments(nextDeployments);
      setLoadedDeploymentsProjectId(project.id);
    } catch (error) {
      setDeploymentsError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.loadDeploymentsFallback"),
        ),
      );
    } finally {
      setIsDeploymentsLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, project, t]);

  useEffect(() => {
    if (activeTab !== "deployments" || !project) {
      return;
    }

    if (loadedDeploymentsProjectId === project.id) {
      return;
    }

    void loadProjectDeployments();
  }, [activeTab, loadProjectDeployments, loadedDeploymentsProjectId, project]);

  const handleEnvSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!project || accessToken.trim().length === 0) {
      return;
    }

    setEnvError(null);
    setEnvNotice(null);
    setIsEnvSaving(true);

    try {
      await putProjectEnv(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              content: envContent,
              onAccessTokenExpired,
              projectId: project.id,
            }
          : {
              accessToken,
              apiBaseUrl,
              content: envContent,
              projectId: project.id,
            },
      );

      setLoadedEnvProjectId(project.id);
      setEnvNotice(t("app.projects.detail.envEditor.saveSuccess"));
    } catch (error) {
      setEnvError(
        toErrorMessage(error, t("app.projects.detail.errors.saveEnvFallback")),
      );
    } finally {
      setIsEnvSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!project || accessToken.trim().length === 0 || isDeployActionDisabled) {
      return;
    }

    setDeploymentsError(null);
    setDeploymentsNotice(null);
    setIsDeploying(true);

    try {
      const latestResult = await deployProject(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId: project.id,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId: project.id,
            },
      );

      await loadProjectDeployments();
      setDeploymentsNotice(
        latestResult.status === "SUCCESS"
          ? t("app.projects.detail.deploymentsPanel.successNotice")
          : t("app.projects.detail.deploymentsPanel.failedNotice"),
      );
    } catch (error) {
      setDeploymentsError(
        toErrorMessage(error, t("app.projects.detail.errors.deployFallback")),
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const projectIdentity = project?.name ?? normalizedProjectId;

  return (
    <>
      <section className="page-heading project-detail-heading">
        <div>
          <p className="page-crumbs">
            {t("app.projects.breadcrumbCurrent")} /{" "}
            {projectIdentity || t("app.projects.detail.pageTitle")}
          </p>
          <h1>
            {project?.name ??
              (isProjectLoading
                ? t("app.projects.detail.loadingTitle")
                : t("app.projects.detail.pageTitle"))}
          </h1>
          <p className="page-summary">{t("app.projects.detail.pageSummary")}</p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            navigate(projectsRoutePath);
          }}
        >
          {t("app.projects.detail.backAction")}
        </button>
      </section>

      <article className="panel project-detail-header">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">
              {t("app.projects.detail.headerEyebrow")}
            </p>
            <h2>{project?.name ?? t("app.projects.detail.panelTitle")}</h2>
          </div>

          <div className="project-detail-pills">
            {project ? (
              <span className="panel-pill">{project.slug}</span>
            ) : null}
            {project ? (
              <span
                className={`project-source-pill project-source-pill-${project.sourceType}`}
              >
                {t(`app.projects.sourceTypes.${project.sourceType}`)}
              </span>
            ) : null}
          </div>
        </div>

        <p className="panel-summary">
          {t("app.projects.detail.headerSummary")}
        </p>

        {projectError ? (
          <p className="field-hint field-hint-error">
            {t("app.projects.detail.errorPrefix")} {projectError}
          </p>
        ) : null}

        {isProjectLoading && !project ? (
          <p className="empty-state">{t("app.projects.detail.loadingBody")}</p>
        ) : null}

        {project ? (
          <div className="tools-grid project-detail-meta">
            <article className="tool-card">
              <span className="tool-label">
                {t("app.projects.detail.idLabel")}
              </span>
              <strong>{project.id}</strong>
              <p>{t("app.projects.detail.idHint")}</p>
            </article>

            <article className="tool-card">
              <span className="tool-label">
                {t("app.projects.detail.slugLabel")}
              </span>
              <strong>{project.slug}</strong>
              <p>{t("app.projects.detail.slugHint")}</p>
            </article>

            <article className="tool-card">
              <span className="tool-label">
                {t("app.projects.detail.sourceTypeLabel")}
              </span>
              <strong>
                {t(`app.projects.sourceTypes.${project.sourceType}`)}
              </strong>
              <p>{t("app.projects.detail.sourceTypeHint")}</p>
            </article>
          </div>
        ) : null}
      </article>

      {project ? (
        <>
          <nav
            aria-label={t("app.projects.detail.tabsAriaLabel")}
            className="project-detail-tabs"
          >
            {projectDetailTabs.map((projectTab) => {
              const isActive = projectTab === activeTab;

              return (
                <button
                  key={projectTab}
                  className={`project-detail-tab${isActive ? " project-detail-tab-active" : ""}`}
                  type="button"
                  onClick={() => {
                    navigate(createProjectDetailPath(project.id, projectTab));
                  }}
                >
                  {t(`app.projects.detail.tabs.${projectTab}`)}
                </button>
              );
            })}
          </nav>

          {activeTab === "env" ? (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">
                    {t("app.projects.detail.panelEyebrow")}
                  </p>
                  <h2>{t("app.projects.detail.tabs.env")}</h2>
                </div>

                <span className="panel-pill">
                  {t("app.projects.detail.envEditor.statusPill")}
                </span>
              </div>

              <p className="panel-summary">
                {t("app.projects.detail.content.env.summary")}
              </p>

              <form className="project-env-form" onSubmit={handleEnvSubmit}>
                <div>
                  <label className="field-label" htmlFor="project-env-content">
                    {t("app.projects.detail.envEditor.inputLabel")}
                  </label>
                  <textarea
                    className="text-input project-env-input"
                    disabled={isEnvLoading || isEnvSaving}
                    id="project-env-content"
                    placeholder={t(
                      "app.projects.detail.envEditor.inputPlaceholder",
                    )}
                    rows={16}
                    value={envContent}
                    onChange={(event) => {
                      setEnvContent(event.target.value);
                    }}
                  />
                </div>

                <div className="project-env-actions">
                  <button
                    className="primary-button"
                    disabled={isEnvLoading || isEnvSaving}
                    type="submit"
                  >
                    {isEnvSaving
                      ? t("app.projects.detail.envEditor.saveLoading")
                      : t("app.projects.detail.envEditor.saveIdle")}
                  </button>

                  <button
                    className="secondary-button"
                    disabled={isEnvLoading || isEnvSaving}
                    type="button"
                    onClick={() => {
                      void loadProjectEnv();
                    }}
                  >
                    {t("app.projects.detail.envEditor.reloadAction")}
                  </button>
                </div>

                <p
                  className={`field-hint${envError ? " field-hint-error" : envNotice ? " project-env-notice-success" : ""}`}
                >
                  {envError ??
                    envNotice ??
                    (isEnvLoading
                      ? t("app.projects.detail.envEditor.loading")
                      : t("app.projects.detail.envEditor.hint"))}
                </p>
              </form>
            </article>
          ) : activeTab === "deployments" ? (
            <article className="panel project-deployments-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">
                    {t("app.projects.detail.panelEyebrow")}
                  </p>
                  <h2>{t("app.projects.detail.tabs.deployments")}</h2>
                </div>

                <span
                  className={`project-deployment-status-pill ${resolveDeploymentStatusClassName(latestDeployment?.status ?? "EMPTY")}`}
                >
                  {latestDeployment
                    ? t(
                        `app.projects.detail.deploymentStatuses.${latestDeployment.status}`,
                      )
                    : t("app.projects.detail.deploymentsPanel.statusEmpty")}
                </span>
              </div>

              <p className="panel-summary">
                {t("app.projects.detail.content.deployments.summary")}
              </p>

              <div className="project-deployments-actions">
                <button
                  className="primary-button"
                  disabled={isDeployActionDisabled}
                  type="button"
                  onClick={() => {
                    void handleDeploy();
                  }}
                >
                  {isDeploying
                    ? t("app.projects.detail.deploymentsPanel.deployLoading")
                    : t("app.projects.detail.deploymentsPanel.deployIdle")}
                </button>
              </div>

              <p
                className={`field-hint${deploymentsError ? " field-hint-error" : deploymentsNotice ? " project-deployments-feedback-success" : ""}`}
              >
                {deploymentsError ??
                  (isDeploying
                    ? t("app.projects.detail.deploymentsPanel.deployLoading")
                    : isDeploymentsLoading
                      ? t("app.projects.detail.deploymentsPanel.loading")
                      : (deploymentsNotice ??
                        (isRunningDeploymentVisible
                          ? t(
                              "app.projects.detail.deploymentsPanel.runningNotice",
                            )
                          : t("app.projects.detail.deploymentsPanel.hint"))))}
              </p>

              <div className="tools-grid project-deployments-grid">
                <article className="tool-card tool-card-wide">
                  <div className="project-deployment-card-header">
                    <div>
                      <span className="tool-label">
                        {t("app.projects.detail.deploymentsPanel.latestLabel")}
                      </span>
                      <strong>
                        {latestDeployment
                          ? latestDeployment.id
                          : t(
                              "app.projects.detail.deploymentsPanel.emptyLatest",
                            )}
                      </strong>
                    </div>

                    <span
                      className={`project-deployment-status-pill ${resolveDeploymentStatusClassName(latestDeployment?.status ?? "EMPTY")}`}
                    >
                      {latestDeployment
                        ? t(
                            `app.projects.detail.deploymentStatuses.${latestDeployment.status}`,
                          )
                        : t("app.projects.detail.deploymentsPanel.statusEmpty")}
                    </span>
                  </div>

                  {latestDeployment ? (
                    <div className="project-deployment-facts">
                      <article>
                        <span className="tool-label">
                          {t(
                            "app.projects.detail.deploymentsPanel.startedAtLabel",
                          )}
                        </span>
                        <strong>
                          {formatDeploymentTimestamp(
                            latestDeployment.startedAt,
                          )}
                        </strong>
                      </article>

                      <article>
                        <span className="tool-label">
                          {t(
                            "app.projects.detail.deploymentsPanel.finishedAtLabel",
                          )}
                        </span>
                        <strong>
                          {latestDeployment.finishedAt
                            ? formatDeploymentTimestamp(
                                latestDeployment.finishedAt,
                              )
                            : t(
                                "app.projects.detail.deploymentsPanel.notFinishedValue",
                              )}
                        </strong>
                      </article>

                      <article>
                        <span className="tool-label">
                          {t(
                            "app.projects.detail.deploymentsPanel.sourceLabel",
                          )}
                        </span>
                        <strong>
                          {t(
                            `app.projects.sourceTypes.${latestDeployment.source}`,
                          )}
                        </strong>
                      </article>

                      <article>
                        <span className="tool-label">
                          {t(
                            "app.projects.detail.deploymentsPanel.triggerLabel",
                          )}
                        </span>
                        <strong>
                          {t(
                            `app.projects.detail.deploymentTriggers.${latestDeployment.trigger}`,
                          )}
                        </strong>
                      </article>
                    </div>
                  ) : (
                    <p className="empty-state">
                      {t("app.projects.detail.deploymentsPanel.emptyLatest")}
                    </p>
                  )}
                </article>

                <article className="tool-card tool-card-wide">
                  <div className="project-deployment-card-header">
                    <div>
                      <span className="tool-label">
                        {t("app.projects.detail.deploymentsPanel.historyLabel")}
                      </span>
                      <strong>
                        {t("app.projects.detail.deploymentsPanel.historyTitle")}
                      </strong>
                    </div>

                    <span className="panel-pill">
                      {recentDeployments.length}
                    </span>
                  </div>

                  {recentDeployments.length > 0 ? (
                    <ol className="project-deployment-history">
                      {recentDeployments.map((deployment) => (
                        <li
                          key={deployment.id}
                          className="project-deployment-history-item"
                        >
                          <div className="project-deployment-history-row">
                            <div>
                              <strong>{deployment.id}</strong>
                              <p>
                                {formatDeploymentTimestamp(
                                  deployment.startedAt,
                                )}
                              </p>
                            </div>

                            <span
                              className={`project-deployment-status-pill ${resolveDeploymentStatusClassName(deployment.status)}`}
                            >
                              {t(
                                `app.projects.detail.deploymentStatuses.${deployment.status}`,
                              )}
                            </span>
                          </div>

                          <p className="project-deployment-history-meta">
                            {t(`app.projects.sourceTypes.${deployment.source}`)}{" "}
                            ·{" "}
                            {t(
                              `app.projects.detail.deploymentTriggers.${deployment.trigger}`,
                            )}{" "}
                            ·{" "}
                            {deployment.finishedAt
                              ? formatDeploymentTimestamp(deployment.finishedAt)
                              : t(
                                  "app.projects.detail.deploymentsPanel.notFinishedValue",
                                )}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="empty-state">
                      {t("app.projects.detail.deploymentsPanel.emptyHistory")}
                    </p>
                  )}
                </article>
              </div>
            </article>
          ) : activeTab === "services" ? (
            <ProjectServicesTab
              accessToken={accessToken}
              apiBaseUrl={apiBaseUrl}
              onAccessTokenExpired={onAccessTokenExpired}
              projectId={project.id}
            />
          ) : activeTab === "logs" ? (
            <ProjectLogsTab
              accessToken={accessToken}
              apiBaseUrl={apiBaseUrl}
              onAccessTokenExpired={onAccessTokenExpired}
              projectId={project.id}
            />
          ) : activeTab === "domains" ? (
            <ProjectDomainsTab
              accessToken={accessToken}
              apiBaseUrl={apiBaseUrl}
              onAccessTokenExpired={onAccessTokenExpired}
              projectId={project.id}
            />
          ) : (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">
                    {t("app.projects.detail.panelEyebrow")}
                  </p>
                  <h2>{t(`app.projects.detail.tabs.${activeTab}`)}</h2>
                </div>

                <span className="panel-pill">
                  {t("app.projects.detail.shellValue")}
                </span>
              </div>

              <p className="panel-summary">
                {t(`${activeTabMeta.translationPath}.summary`)}
              </p>

              <div className="tools-grid">
                <article className="tool-card tool-card-wide">
                  <span className="tool-label">
                    {t("app.projects.detail.activeTabLabel")}
                  </span>
                  <strong>{t(`app.projects.detail.tabs.${activeTab}`)}</strong>
                  <p>{t(`${activeTabMeta.translationPath}.description`)}</p>
                </article>

                <article className="tool-card">
                  <span className="tool-label">
                    {t("app.projects.detail.endpointLabel")}
                  </span>
                  <strong>{activeTabMeta.endpoint}</strong>
                  <p>{t(`${activeTabMeta.translationPath}.endpointHint`)}</p>
                </article>

                <article className="tool-card">
                  <span className="tool-label">
                    {t("app.projects.detail.shellLabel")}
                  </span>
                  <strong>{t("app.projects.detail.shellValue")}</strong>
                  <p>{t(`${activeTabMeta.translationPath}.nextStep`)}</p>
                </article>
              </div>
            </article>
          )}
        </>
      ) : null}
    </>
  );
};
