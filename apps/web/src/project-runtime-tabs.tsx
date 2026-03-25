import type { DomainDto, ServiceDto } from "@dockeradmin/shared";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useI18n } from "./i18n-provider";
import {
  applyProjectLogsStreamMessage,
  createProjectLogsStreamUrl,
  defaultProjectLogsTail,
} from "./project-logs-stream";
import {
  createDomain,
  deleteDomain,
  getProjectLogs,
  listDomains,
  listProjectServices,
  performServiceAction,
} from "./projects";

type ProjectRuntimeTabProps = {
  accessToken: string;
  apiBaseUrl: string;
  onAccessTokenExpired: (() => Promise<string | null>) | undefined;
  projectId: string;
};

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const resolveServiceStatusTone = (status: ServiceDto["status"]) => {
  switch (status) {
    case "running":
      return "healthy";
    case "starting":
      return "watch";
    default:
      return "idle";
  }
};

const resolveSuggestedDomainPort = (
  services: readonly ServiceDto[],
): string => {
  const firstPort = services[0]?.ports[0];
  const matchedPort = firstPort?.match(/\d{1,5}/)?.[0];

  return matchedPort ?? "80";
};

export const ProjectServicesTab = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
  projectId,
}: ProjectRuntimeTabProps) => {
  const { t } = useI18n();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesNotice, setServicesNotice] = useState<string | null>(null);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setServices([]);
      setServicesError(null);
      setServicesNotice(null);
      setIsServicesLoading(false);
      setActiveServiceId(null);

      return;
    }

    setServicesError(null);
    setIsServicesLoading(true);

    try {
      const nextServices = await listProjectServices(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId,
            },
      );

      setServices(nextServices);
    } catch (error) {
      setServicesError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.loadServicesFallback"),
        ),
      );
    } finally {
      setIsServicesLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, projectId, t]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const handleServiceAction = async (
    service: ServiceDto,
    action: "start" | "stop" | "restart",
  ) => {
    if (!service.serviceId || accessToken.trim().length === 0) {
      return;
    }

    setServicesError(null);
    setServicesNotice(null);
    setActiveServiceId(service.serviceId);

    try {
      await performServiceAction(
        onAccessTokenExpired
          ? {
              accessToken,
              action,
              apiBaseUrl,
              onAccessTokenExpired,
              serviceId: service.serviceId,
            }
          : {
              accessToken,
              action,
              apiBaseUrl,
              serviceId: service.serviceId,
            },
      );

      await loadServices();
      setServicesNotice(t("app.projects.detail.servicesPanel.actionSuccess"));
    } catch (error) {
      setServicesError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.serviceActionFallback"),
        ),
      );
    } finally {
      setActiveServiceId(null);
    }
  };

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">
            {t("app.projects.detail.panelEyebrow")}
          </p>
          <h2>{t("app.projects.detail.tabs.services")}</h2>
        </div>

        <span className="panel-pill">{services.length}</span>
      </div>

      <p className="panel-summary">
        {t("app.projects.detail.content.services.summary")}
      </p>

      <p
        className={`field-hint${servicesError ? " field-hint-error" : servicesNotice ? " project-runtime-feedback-success" : ""}`}
      >
        {servicesError ??
          servicesNotice ??
          (isServicesLoading
            ? t("app.projects.detail.servicesPanel.loading")
            : t("app.projects.detail.servicesPanel.hint"))}
      </p>

      {isServicesLoading ? (
        <p className="empty-state">
          {t("app.projects.detail.servicesPanel.loading")}
        </p>
      ) : services.length === 0 ? (
        <p className="empty-state">
          {t("app.projects.detail.servicesPanel.empty")}
        </p>
      ) : (
        <div className="project-services-list">
          {services.map((service) => {
            const isRowBusy =
              service.serviceId !== undefined &&
              activeServiceId === service.serviceId;

            return (
              <article
                className="tool-card project-service-card"
                key={service.serviceName}
              >
                <div className="project-service-card-header">
                  <div>
                    <span className="tool-label">
                      {t("app.projects.detail.servicesPanel.serviceLabel")}
                    </span>
                    <strong>{service.serviceName}</strong>
                    <p>{service.containerName}</p>
                  </div>

                  <span
                    className={`status-pill status-pill-${resolveServiceStatusTone(service.status)}`}
                  >
                    {t(`app.projects.detail.serviceStatuses.${service.status}`)}
                  </span>
                </div>

                <div className="project-service-meta">
                  <span>
                    {t("app.projects.detail.servicesPanel.imageLabel")}:{" "}
                    {service.image}
                  </span>
                  <span>
                    {t("app.projects.detail.servicesPanel.portsLabel")}:{" "}
                    {service.ports.length > 0
                      ? service.ports.join(", ")
                      : t("app.projects.detail.servicesPanel.noPortsValue")}
                  </span>
                  <span>
                    {t("app.projects.detail.servicesPanel.startedAtLabel")}:{" "}
                    {service.startedAt
                      ? formatTimestamp(service.startedAt)
                      : t("app.projects.detail.servicesPanel.notStartedValue")}
                  </span>
                </div>

                <div className="project-service-actions">
                  {(["start", "stop", "restart"] as const).map((action) => (
                    <button
                      key={action}
                      className="secondary-button project-service-action-button"
                      disabled={!service.serviceId || isRowBusy}
                      type="button"
                      onClick={() => {
                        void handleServiceAction(service, action);
                      }}
                    >
                      {isRowBusy
                        ? t("app.projects.detail.servicesPanel.actionLoading")
                        : t(`app.projects.detail.serviceActions.${action}`)}
                    </button>
                  ))}
                </div>

                {!service.serviceId ? (
                  <p className="field-hint">
                    {t("app.projects.detail.servicesPanel.actionUnavailable")}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </article>
  );
};

export const ProjectLogsTab = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
  projectId,
}: ProjectRuntimeTabProps) => {
  const { t } = useI18n();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "live"
  >("idle");
  const logLinesRef = useRef<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    logLinesRef.current = logLines;
  }, [logLines]);

  const closeSocket = useCallback(() => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.close();
    socketRef.current = null;
  }, []);

  const loadServices = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setServices([]);
      setServicesError(null);
      setIsServicesLoading(false);
      setSelectedServiceName("");

      return;
    }

    setServicesError(null);
    setIsServicesLoading(true);

    try {
      const nextServices = await listProjectServices(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId,
            },
      );

      setServices(nextServices);
      setSelectedServiceName((currentValue) => {
        if (
          nextServices.some((service) => service.serviceName === currentValue)
        ) {
          return currentValue;
        }

        return nextServices[0]?.serviceName ?? "";
      });
    } catch (error) {
      setServicesError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.loadServicesFallback"),
        ),
      );
      setServices([]);
      setSelectedServiceName("");
    } finally {
      setIsServicesLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, projectId, t]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  useEffect(() => {
    if (
      selectedServiceName.trim().length === 0 ||
      accessToken.trim().length === 0
    ) {
      closeSocket();
      setLogLines([]);
      setLogsError(null);
      setIsLogsLoading(false);
      setConnectionState("idle");

      return;
    }

    let isActive = true;

    closeSocket();
    setLogsError(null);
    setIsLogsLoading(true);
    setConnectionState("connecting");

    const openLogsStream = async () => {
      try {
        const snapshot = await getProjectLogs(
          onAccessTokenExpired
            ? {
                accessToken,
                apiBaseUrl,
                onAccessTokenExpired,
                projectId,
                serviceName: selectedServiceName,
                tail: defaultProjectLogsTail,
              }
            : {
                accessToken,
                apiBaseUrl,
                projectId,
                serviceName: selectedServiceName,
                tail: defaultProjectLogsTail,
              },
        );

        if (!isActive) {
          return;
        }

        setLogLines(snapshot.lines);
        setIsLogsLoading(false);

        if (typeof WebSocket === "undefined") {
          setConnectionState("idle");
          setLogsError(t("app.projects.detail.logsPanel.socketUnavailable"));

          return;
        }

        const socket = new WebSocket(
          createProjectLogsStreamUrl({
            accessToken,
            apiBaseUrl,
            projectId,
            serviceName: selectedServiceName,
            tail: defaultProjectLogsTail,
          }),
        );

        socketRef.current = socket;

        socket.addEventListener("open", () => {
          if (!isActive) {
            return;
          }

          setConnectionState("live");
        });

        socket.addEventListener("message", (event) => {
          if (!isActive) {
            return;
          }

          try {
            const nextState = applyProjectLogsStreamMessage({
              currentLines: logLinesRef.current,
              message: JSON.parse(String(event.data)),
            });

            setLogLines(nextState.lines);
            setLogsError(nextState.error);
          } catch {
            setLogsError(
              t("app.projects.detail.logsPanel.streamFrameFallback"),
            );
          }
        });

        socket.addEventListener("error", () => {
          if (!isActive) {
            return;
          }

          setConnectionState("idle");
          setLogsError((currentValue) => {
            return (
              currentValue ??
              t("app.projects.detail.logsPanel.streamConnectFallback")
            );
          });
        });

        socket.addEventListener("close", () => {
          if (!isActive) {
            return;
          }

          setConnectionState("idle");
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLogLines([]);
        setIsLogsLoading(false);
        setConnectionState("idle");
        setLogsError(
          toErrorMessage(
            error,
            t("app.projects.detail.errors.loadLogsFallback"),
          ),
        );
      }
    };

    void openLogsStream();

    return () => {
      isActive = false;
      closeSocket();
    };
  }, [
    accessToken,
    apiBaseUrl,
    closeSocket,
    onAccessTokenExpired,
    projectId,
    selectedServiceName,
    t,
  ]);

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">
            {t("app.projects.detail.panelEyebrow")}
          </p>
          <h2>{t("app.projects.detail.tabs.logs")}</h2>
        </div>

        <span className="panel-pill">
          {t(
            `app.projects.detail.logsPanel.connectionStates.${connectionState}`,
          )}
        </span>
      </div>

      <p className="panel-summary">
        {t("app.projects.detail.content.logs.summary")}
      </p>

      <div className="project-logs-toolbar">
        <div className="project-logs-selector">
          <label className="field-label" htmlFor="project-log-service">
            {t("app.projects.detail.logsPanel.serviceLabel")}
          </label>
          <select
            className="language-select"
            disabled={isServicesLoading || services.length === 0}
            id="project-log-service"
            value={selectedServiceName}
            onChange={(event) => {
              setSelectedServiceName(event.target.value);
            }}
          >
            {services.map((service) => (
              <option key={service.serviceName} value={service.serviceName}>
                {service.serviceName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p
        className={`field-hint${logsError || servicesError ? " field-hint-error" : ""}`}
      >
        {servicesError ??
          logsError ??
          (isServicesLoading
            ? t("app.projects.detail.logsPanel.loadingServices")
            : isLogsLoading
              ? t("app.projects.detail.logsPanel.loadingSnapshot")
              : services.length === 0
                ? t("app.projects.detail.logsPanel.emptyServices")
                : t("app.projects.detail.logsPanel.hint"))}
      </p>

      <pre className="project-logs-output">
        {logLines.length > 0
          ? logLines.join("\n")
          : t("app.projects.detail.logsPanel.emptyLogs")}
      </pre>
    </article>
  );
};

export const ProjectDomainsTab = ({
  accessToken,
  apiBaseUrl,
  onAccessTokenExpired,
  projectId,
}: ProjectRuntimeTabProps) => {
  const { t } = useI18n();
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [domainsNotice, setDomainsNotice] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [isDomainsLoading, setIsDomainsLoading] = useState(false);
  const [isDomainCreating, setIsDomainCreating] = useState(false);
  const [deletingDomainId, setDeletingDomainId] = useState<string | null>(null);
  const [domainHost, setDomainHost] = useState("");
  const [domainPort, setDomainPort] = useState("80");
  const [domainServiceName, setDomainServiceName] = useState("");
  const [tlsEnabled, setTlsEnabled] = useState(true);

  const loadDomainsForProject = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setDomains([]);
      setDomainsError(null);
      setDomainsNotice(null);
      setIsDomainsLoading(false);
      setDeletingDomainId(null);

      return;
    }

    setDomainsError(null);
    setIsDomainsLoading(true);

    try {
      const nextDomains = await listDomains(
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

      setDomains(
        nextDomains.filter((domain) => domain.projectId === projectId),
      );
    } catch (error) {
      setDomainsError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.loadDomainsFallback"),
        ),
      );
    } finally {
      setIsDomainsLoading(false);
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, projectId, t]);

  const loadServicesForDomainForm = useCallback(async () => {
    if (accessToken.trim().length === 0) {
      setServices([]);
      setServicesError(null);
      setDomainServiceName("");
      setDomainPort("80");

      return;
    }

    setServicesError(null);

    try {
      const nextServices = await listProjectServices(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              onAccessTokenExpired,
              projectId,
            }
          : {
              accessToken,
              apiBaseUrl,
              projectId,
            },
      );

      setServices(nextServices);
      setDomainServiceName((currentValue) => {
        if (
          nextServices.some((service) => service.serviceName === currentValue)
        ) {
          return currentValue;
        }

        return nextServices[0]?.serviceName ?? "";
      });
      setDomainPort((currentValue) => {
        return currentValue.trim().length > 0
          ? currentValue
          : resolveSuggestedDomainPort(nextServices);
      });
    } catch (error) {
      setServicesError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.loadServicesFallback"),
        ),
      );
      setServices([]);
      setDomainServiceName("");
    }
  }, [accessToken, apiBaseUrl, onAccessTokenExpired, projectId, t]);

  useEffect(() => {
    void loadDomainsForProject();
    void loadServicesForDomainForm();
  }, [loadDomainsForProject, loadServicesForDomainForm]);

  const handleCreateDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      accessToken.trim().length === 0 ||
      domainServiceName.trim().length === 0
    ) {
      return;
    }

    setDomainsError(null);
    setDomainsNotice(null);
    setIsDomainCreating(true);

    try {
      await createDomain(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              host: domainHost,
              onAccessTokenExpired,
              port: Number(domainPort),
              projectId,
              serviceName: domainServiceName,
              tlsEnabled,
            }
          : {
              accessToken,
              apiBaseUrl,
              host: domainHost,
              port: Number(domainPort),
              projectId,
              serviceName: domainServiceName,
              tlsEnabled,
            },
      );

      await loadDomainsForProject();
      setDomainHost("");
      setDomainsNotice(t("app.projects.detail.domainsPanel.createSuccess"));
    } catch (error) {
      setDomainsError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.createDomainFallback"),
        ),
      );
    } finally {
      setIsDomainCreating(false);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (accessToken.trim().length === 0) {
      return;
    }

    setDomainsError(null);
    setDomainsNotice(null);
    setDeletingDomainId(domainId);

    try {
      await deleteDomain(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              domainId,
              onAccessTokenExpired,
            }
          : {
              accessToken,
              apiBaseUrl,
              domainId,
            },
      );

      await loadDomainsForProject();
      setDomainsNotice(t("app.projects.detail.domainsPanel.deleteSuccess"));
    } catch (error) {
      setDomainsError(
        toErrorMessage(
          error,
          t("app.projects.detail.errors.deleteDomainFallback"),
        ),
      );
    } finally {
      setDeletingDomainId(null);
    }
  };

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">
            {t("app.projects.detail.panelEyebrow")}
          </p>
          <h2>{t("app.projects.detail.tabs.domains")}</h2>
        </div>

        <span className="panel-pill">{domains.length}</span>
      </div>

      <p className="panel-summary">
        {t("app.projects.detail.content.domains.summary")}
      </p>

      <div className="project-domains-layout">
        <form className="project-domain-form" onSubmit={handleCreateDomain}>
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="project-domain-host">
                {t("app.projects.detail.domainsPanel.hostLabel")}
              </label>
              <input
                className="text-input"
                disabled={isDomainCreating}
                id="project-domain-host"
                placeholder={t(
                  "app.projects.detail.domainsPanel.hostPlaceholder",
                )}
                type="text"
                value={domainHost}
                onChange={(event) => {
                  setDomainHost(event.target.value);
                }}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="project-domain-service">
                {t("app.projects.detail.domainsPanel.serviceLabel")}
              </label>
              <select
                className="language-select"
                disabled={isDomainCreating || services.length === 0}
                id="project-domain-service"
                value={domainServiceName}
                onChange={(event) => {
                  setDomainServiceName(event.target.value);
                }}
              >
                {services.map((service) => (
                  <option key={service.serviceName} value={service.serviceName}>
                    {service.serviceName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="project-domain-port">
                {t("app.projects.detail.domainsPanel.portLabel")}
              </label>
              <input
                className="text-input"
                disabled={isDomainCreating}
                id="project-domain-port"
                inputMode="numeric"
                placeholder={t(
                  "app.projects.detail.domainsPanel.portPlaceholder",
                )}
                type="text"
                value={domainPort}
                onChange={(event) => {
                  setDomainPort(event.target.value);
                }}
              />
            </div>

            <label
              className="project-domain-checkbox"
              htmlFor="project-domain-tls"
            >
              <input
                checked={tlsEnabled}
                className="project-domain-checkbox-input"
                disabled={isDomainCreating}
                id="project-domain-tls"
                type="checkbox"
                onChange={(event) => {
                  setTlsEnabled(event.target.checked);
                }}
              />
              <span>{t("app.projects.detail.domainsPanel.tlsLabel")}</span>
            </label>
          </div>

          <div className="project-domain-actions">
            <button
              className="primary-button"
              disabled={
                isDomainCreating ||
                services.length === 0 ||
                domainServiceName.trim().length === 0
              }
              type="submit"
            >
              {isDomainCreating
                ? t("app.projects.detail.domainsPanel.submitLoading")
                : t("app.projects.detail.domainsPanel.submitIdle")}
            </button>
          </div>

          <p
            className={`field-hint${domainsError || servicesError ? " field-hint-error" : domainsNotice ? " project-runtime-feedback-success" : ""}`}
          >
            {domainsError ??
              servicesError ??
              domainsNotice ??
              (services.length === 0
                ? t("app.projects.detail.domainsPanel.noServicesHint")
                : t("app.projects.detail.domainsPanel.hint"))}
          </p>
        </form>

        {isDomainsLoading ? (
          <p className="empty-state">
            {t("app.projects.detail.domainsPanel.loading")}
          </p>
        ) : domains.length === 0 ? (
          <p className="empty-state">
            {t("app.projects.detail.domainsPanel.empty")}
          </p>
        ) : (
          <div className="project-domains-list">
            {domains.map((domain) => (
              <article
                className="tool-card project-domain-card"
                key={domain.id}
              >
                <div className="project-domain-card-header">
                  <div>
                    <span className="tool-label">
                      {t("app.projects.detail.domainsPanel.domainLabel")}
                    </span>
                    <strong>{domain.host}</strong>
                    <p>
                      {domain.serviceName}:{domain.port}
                    </p>
                  </div>

                  <span className="panel-pill">
                    {domain.tlsEnabled
                      ? t("app.projects.detail.domainsPanel.tlsEnabled")
                      : t("app.projects.detail.domainsPanel.tlsDisabled")}
                  </span>
                </div>

                <div className="project-domain-actions">
                  <button
                    className="secondary-button"
                    disabled={deletingDomainId === domain.id}
                    type="button"
                    onClick={() => {
                      void handleDeleteDomain(domain.id);
                    }}
                  >
                    {deletingDomainId === domain.id
                      ? t("app.projects.detail.domainsPanel.deleteLoading")
                      : t("app.projects.detail.domainsPanel.deleteAction")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </article>
  );
};
