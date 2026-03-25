import type { ProjectDto } from "@dockeradmin/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "./i18n-provider";
import { createProjectDetailPath } from "./project-detail-routing";
import {
  createProject,
  listProjects,
  uploadProjectGitSource,
  uploadProjectZipSource,
} from "./projects";

type ProjectsPageProps = {
  accessToken: string;
  apiBaseUrl: string;
  onAccessTokenExpired?: () => Promise<string | null>;
};

const initialSourceType = "zip" as const;

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

export const ProjectsPage = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
}: ProjectsPageProps) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const [pendingProject, setPendingProject] = useState<ProjectDto | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectSourceType, setProjectSourceType] = useState<"zip" | "git">(
    initialSourceType,
  );
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [zipArchive, setZipArchive] = useState<File | null>(null);

  const resetCreateFlow = () => {
    setPendingProject(null);
    setProjectName("");
    setProjectSourceType(initialSourceType);
    setGitUrl("");
    setGitBranch("");
    setZipArchive(null);
    setCreateError(null);
  };

  const loadProjectsList = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setProjects([]);
      setProjectsError(null);
      setIsProjectsLoading(false);

      return;
    }

    setProjectsError(null);
    setIsProjectsLoading(true);

    try {
      const nextProjects = await listProjects(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
            }
          : {
              accessToken,
              apiBaseUrl,
            },
      );

      setProjects(nextProjects);
    } catch (error) {
      setProjectsError(
        toErrorMessage(error, t("app.projects.errors.listFallback")),
      );
    } finally {
      setIsProjectsLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, t]);

  useEffect(() => {
    void loadProjectsList();
  }, [loadProjectsList]);

  const handleOpenCreatePanel = () => {
    resetCreateFlow();
    setCreateNotice(null);
    setIsCreatePanelOpen(true);
  };

  const handleCloseCreatePanel = () => {
    if (isCreateLoading) {
      return;
    }

    setIsCreatePanelOpen(false);
    resetCreateFlow();
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (accessToken.trim().length === 0) {
      return;
    }

    setCreateError(null);
    setCreateNotice(null);
    setIsCreateLoading(true);

    try {
      if (!pendingProject) {
        const createdProject = await createProject(
          onAccessTokenExpired
            ? {
                accessToken,
                apiBaseUrl,
                name: projectName,
                onAccessTokenExpired,
                sourceType: projectSourceType,
              }
            : {
                accessToken,
                apiBaseUrl,
                name: projectName,
                sourceType: projectSourceType,
              },
        );

        setPendingProject(createdProject);
        setCreateNotice(t("app.projects.create.metadataCreated"));
        await loadProjectsList();

        return;
      }

      if (pendingProject.sourceType === "zip") {
        if (!zipArchive) {
          throw new Error(t("app.projects.errors.zipRequired"));
        }

        await uploadProjectZipSource(
          onAccessTokenExpired
            ? {
                accessToken,
                apiBaseUrl,
                archive: zipArchive,
                onAccessTokenExpired,
                projectId: pendingProject.id,
              }
            : {
                accessToken,
                apiBaseUrl,
                archive: zipArchive,
                projectId: pendingProject.id,
              },
        );
      } else {
        const normalizedGitBranch = gitBranch.trim();
        const gitSourceRequest = onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId: pendingProject.id,
              url: gitUrl,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId: pendingProject.id,
              url: gitUrl,
            };

        await uploadProjectGitSource(
          normalizedGitBranch.length > 0
            ? {
                ...gitSourceRequest,
                branch: normalizedGitBranch,
              }
            : gitSourceRequest,
        );
      }

      await loadProjectsList();
      setCreateNotice(t("app.projects.create.completed"));
      setIsCreatePanelOpen(false);
      resetCreateFlow();
    } catch (error) {
      setCreateError(
        toErrorMessage(error, t("app.projects.errors.createFallback")),
      );
    } finally {
      setIsCreateLoading(false);
    }
  };

  return (
    <section className="projects-layout">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">{t("app.projects.eyebrow")}</p>
            <h2>{t("app.projects.listTitle")}</h2>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={handleOpenCreatePanel}
          >
            {t("app.projects.create.action")}
          </button>
        </div>

        <p className="panel-summary">{t("app.projects.listSummary")}</p>

        {createNotice ? (
          <p className="field-hint projects-feedback-success">{createNotice}</p>
        ) : null}

        {projectsError ? (
          <p className="field-hint field-hint-error">
            {t("app.projects.errorPrefix")} {projectsError}
          </p>
        ) : null}

        {isProjectsLoading && projects.length === 0 ? (
          <p className="empty-state">{t("app.projects.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">{t("app.projects.empty")}</p>
        ) : (
          <div className="services-table-wrap">
            <table className="services-table">
              <thead>
                <tr>
                  <th>{t("app.projects.columns.name")}</th>
                  <th>{t("app.projects.columns.slug")}</th>
                  <th>{t("app.projects.columns.sourceType")}</th>
                  <th>{t("app.projects.columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  return (
                    <tr key={project.id}>
                      <td>{project.name}</td>
                      <td>{project.slug}</td>
                      <td>
                        <span
                          className={`project-source-pill project-source-pill-${project.sourceType}`}
                        >
                          {t(`app.projects.sourceTypes.${project.sourceType}`)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="secondary-button project-open-button"
                          type="button"
                          onClick={() => {
                            navigate(createProjectDetailPath(project.id));
                          }}
                        >
                          {t("app.projects.openAction")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-project-create">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">{t("app.projects.create.eyebrow")}</p>
            <h2>{t("app.projects.create.title")}</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={handleCloseCreatePanel}
          >
            {isCreatePanelOpen
              ? t("app.projects.create.close")
              : t("app.projects.create.action")}
          </button>
        </div>

        <p className="panel-summary">{t("app.projects.create.summary")}</p>

        {!isCreatePanelOpen ? (
          <p className="empty-state">{t("app.projects.create.closedHint")}</p>
        ) : (
          <form className="projects-create-form" onSubmit={handleCreateSubmit}>
            {!pendingProject ? (
              <>
                <div>
                  <label className="field-label" htmlFor="project-name">
                    {t("app.projects.create.nameLabel")}
                  </label>
                  <input
                    className="text-input"
                    id="project-name"
                    placeholder={t("app.projects.create.namePlaceholder")}
                    type="text"
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value);
                    }}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="project-source-type">
                    {t("app.projects.create.sourceTypeLabel")}
                  </label>
                  <select
                    className="language-select"
                    id="project-source-type"
                    value={projectSourceType}
                    onChange={(event) => {
                      setProjectSourceType(
                        event.target.value === "git" ? "git" : "zip",
                      );
                    }}
                  >
                    <option value="zip">
                      {t("app.projects.sourceTypes.zip")}
                    </option>
                    <option value="git">
                      {t("app.projects.sourceTypes.git")}
                    </option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="tool-card">
                  <span className="tool-label">
                    {t("app.projects.create.pendingLabel")}
                  </span>
                  <strong>{pendingProject.name}</strong>
                  <p>
                    {pendingProject.slug} /{" "}
                    {t(`app.projects.sourceTypes.${pendingProject.sourceType}`)}
                  </p>
                </div>

                {pendingProject.sourceType === "zip" ? (
                  <div>
                    <label className="field-label" htmlFor="project-zip-file">
                      {t("app.projects.create.zipLabel")}
                    </label>
                    <input
                      accept=".zip,application/zip"
                      className="text-input"
                      id="project-zip-file"
                      type="file"
                      onChange={(event) => {
                        setZipArchive(event.target.files?.[0] ?? null);
                      }}
                    />
                    <p className="field-hint">
                      {zipArchive?.name ?? t("app.projects.create.zipHint")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="field-label" htmlFor="project-git-url">
                        {t("app.projects.create.gitUrlLabel")}
                      </label>
                      <input
                        className="text-input"
                        id="project-git-url"
                        placeholder={t("app.projects.create.gitUrlPlaceholder")}
                        type="url"
                        value={gitUrl}
                        onChange={(event) => {
                          setGitUrl(event.target.value);
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="field-label"
                        htmlFor="project-git-branch"
                      >
                        {t("app.projects.create.gitBranchLabel")}
                      </label>
                      <input
                        className="text-input"
                        id="project-git-branch"
                        placeholder={t(
                          "app.projects.create.gitBranchPlaceholder",
                        )}
                        type="text"
                        value={gitBranch}
                        onChange={(event) => {
                          setGitBranch(event.target.value);
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            <div className="projects-create-actions">
              <button
                className="primary-button"
                disabled={isCreateLoading}
                type="submit"
              >
                {!pendingProject
                  ? isCreateLoading
                    ? t("app.projects.create.continueLoading")
                    : t("app.projects.create.continueIdle")
                  : pendingProject.sourceType === "zip"
                    ? isCreateLoading
                      ? t("app.projects.create.zipSubmitLoading")
                      : t("app.projects.create.zipSubmitIdle")
                    : isCreateLoading
                      ? t("app.projects.create.gitSubmitLoading")
                      : t("app.projects.create.gitSubmitIdle")}
              </button>

              <button
                className="secondary-button"
                disabled={isCreateLoading}
                type="button"
                onClick={handleCloseCreatePanel}
              >
                {t("app.projects.create.cancel")}
              </button>
            </div>

            <p
              className={`field-hint${createError ? " field-hint-error" : ""}`}
            >
              {createError ??
                (pendingProject
                  ? t("app.projects.create.sourceHint")
                  : t("app.projects.create.metadataHint"))}
            </p>
          </form>
        )}
      </article>
    </section>
  );
};
