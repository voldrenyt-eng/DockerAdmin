import {
  type AuthDto,
  type MetricsDto,
  parseApiError,
} from "@dockeradmin/shared";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { AuditPage } from "./audit-page";
import { auditRoutePath } from "./audit-routing";
import {
  clearStoredAuthSession,
  loginWithPassword,
  logoutAuthSession,
  readStoredAuthSession,
  refreshAuthSession,
  writeStoredAuthSession,
} from "./auth";
import {
  dashboardRoutePath,
  loginRoutePath,
  resolveProtectedRouteRedirect,
  resolvePublicRouteRedirect,
  resolveUnknownRouteRedirect,
} from "./auth-routing";
import { resolveLocale } from "./i18n";
import { supportedLocales, useI18n } from "./i18n-provider";
import {
  createMetricsPollingController,
  readStoredMetricsSession,
  resolveMetricsApiBaseUrl,
  writeStoredMetricsSession,
} from "./metrics";
import {
  ProjectDetailPage,
  ProjectDetailRouteRedirect,
} from "./project-detail-page";
import {
  projectDetailBaseRoutePattern,
  projectDetailTabRoutePattern,
  projectsRoutePath,
} from "./project-detail-routing";
import { ProjectsPage } from "./projects-page";

type ServiceStatus = "healthy" | "watch" | "idle";

type PressureBar = {
  cpuHeight: number;
  cpuLabel: string;
  label: string;
  memoryHeight: number;
  memoryLabel: string;
};

type ServiceRow = {
  cpu: string;
  memory: string;
  name: string;
  status: ServiceStatus;
  traffic: string;
};

type AuthRouteBoundaryProps = {
  authSession: AuthDto | null;
  children: ReactNode;
};

const gib = 1024 ** 3;
const getBrowserLocation = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location;
};

const getBrowserStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

const createUserInitials = (session: AuthDto | null): string => {
  const source = session?.user.email.split("@")[0]?.replace(/[^a-z0-9]/giu, "");

  if (!source || source.length === 0) {
    return "AD";
  }

  return source.slice(0, 2).toUpperCase();
};

const formatByteCount = (value: number, locale: string): string => {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let unitIndex = 0;
  let displayValue = value;

  while (displayValue >= 1024 && unitIndex < units.length - 1) {
    displayValue /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(displayValue)} ${units[unitIndex]}`;
};

const formatCompactValue = (value: number, locale: string): string => {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
};

const formatCpuPercent = (value: number, locale: string): string => {
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: value === 0 ? 0 : 2,
  }).format(value)}%`;
};

const formatUpdatedAt = (value: string, locale: string): string => {
  return new Date(value).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const sumMetricValues = (
  metrics: MetricsDto[],
  selector: (metric: MetricsDto) => number,
): number => {
  return metrics.reduce((total, metric) => {
    return total + selector(metric);
  }, 0);
};

const calculateMemoryRatio = (metric: MetricsDto): number => {
  if (metric.memoryLimitBytes <= 0) {
    return 0;
  }

  return metric.memoryUsageBytes / metric.memoryLimitBytes;
};

const resolveServiceStatus = (metric: MetricsDto): ServiceStatus => {
  const traffic = metric.networkRxBytes + metric.networkTxBytes;
  const memoryRatio = calculateMemoryRatio(metric);

  if (metric.cpuPercent >= 70 || memoryRatio >= 0.78) {
    return "watch";
  }

  if (metric.cpuPercent <= 2 && traffic <= 0 && metric.memoryUsageBytes <= 0) {
    return "idle";
  }

  return "healthy";
};

const createRuntimeTrend = (metrics: MetricsDto[]): number[] => {
  const liveValues = metrics
    .slice()
    .sort((left, right) => {
      return left.serviceName.localeCompare(right.serviceName);
    })
    .map((metric, index) => {
      const cpuScore = metric.cpuPercent * 2.2;
      const memoryScore = (metric.memoryUsageBytes / gib) * 18;
      const trafficScore =
        ((metric.networkRxBytes + metric.networkTxBytes) / 1024 / 1024) * 0.08;

      return Math.round(cpuScore + memoryScore + trafficScore + 18 + index * 3);
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  const series =
    liveValues.length > 0
      ? [...liveValues]
      : [52, 41, 26, 35, 29, 40, 54, 49, 61, 70, 82, 94];

  while (series.length < 12) {
    const previous = series[series.length - 1] ?? 48;
    const anchor = series[series.length % Math.max(liveValues.length, 1)] ?? 52;
    const drift = series.length % 2 === 0 ? 6 : -4;

    series.push(
      Math.max(14, Math.round(previous * 0.58 + anchor * 0.42 + drift)),
    );
  }

  return series.slice(0, 12);
};

const buildChartPath = (values: number[]) => {
  const width = 640;
  const height = 248;
  const paddingX = 18;
  const paddingY = 20;
  const safeValues =
    values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const minValue = Math.min(...safeValues);
  const maxValue = Math.max(...safeValues, 1);
  const range = maxValue - minValue || 1;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const lastIndex = safeValues.length - 1;

  const points = safeValues.map((value, index) => {
    const x = paddingX + (usableWidth * index) / Math.max(lastIndex, 1);
    const y =
      height -
      paddingY -
      ((value - minValue) / range) * Math.max(usableHeight, 1);

    return { x, y };
  });

  const linePath = points
    .map((point, index) => {
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");
  const lastPoint = points[points.length - 1] ?? {
    x: width - paddingX,
    y: height,
  };
  const firstPoint = points[0] ?? { x: paddingX, y: height };
  const areaPath = `${linePath} L ${lastPoint.x} ${height - paddingY / 2} L ${firstPoint.x} ${height - paddingY / 2} Z`;

  return { areaPath, height, points, width, linePath };
};

const buildPressureBars = (
  metrics: MetricsDto[],
  locale: string,
): PressureBar[] => {
  const liveBars = metrics
    .slice()
    .sort((left, right) => {
      const leftScore =
        left.cpuPercent +
        calculateMemoryRatio(left) * 100 +
        left.memoryUsageBytes / gib;
      const rightScore =
        right.cpuPercent +
        calculateMemoryRatio(right) * 100 +
        right.memoryUsageBytes / gib;

      return rightScore - leftScore;
    })
    .slice(0, 6);

  const sourceMetrics =
    liveBars.length > 0
      ? liveBars
      : [
          {
            cpuPercent: 34,
            memoryLimitBytes: 4 * gib,
            memoryUsageBytes: Math.round(1.1 * gib),
            networkRxBytes: 0,
            networkTxBytes: 0,
            serviceName: "api",
          },
          {
            cpuPercent: 18,
            memoryLimitBytes: 2 * gib,
            memoryUsageBytes: Math.round(0.9 * gib),
            networkRxBytes: 0,
            networkTxBytes: 0,
            serviceName: "web",
          },
          {
            cpuPercent: 42,
            memoryLimitBytes: 3 * gib,
            memoryUsageBytes: Math.round(1.5 * gib),
            networkRxBytes: 0,
            networkTxBytes: 0,
            serviceName: "worker",
          },
          {
            cpuPercent: 26,
            memoryLimitBytes: 2 * gib,
            memoryUsageBytes: Math.round(0.7 * gib),
            networkRxBytes: 0,
            networkTxBytes: 0,
            serviceName: "proxy",
          },
        ];
  const maxCpu = Math.max(
    ...sourceMetrics.map((metric) => Math.max(metric.cpuPercent, 1)),
    1,
  );
  const maxMemory = Math.max(
    ...sourceMetrics.map((metric) =>
      Math.max(calculateMemoryRatio(metric) * 100, 1),
    ),
    1,
  );

  return sourceMetrics.map((metric) => {
    const memoryPercent = calculateMemoryRatio(metric) * 100;

    return {
      cpuHeight: clamp((metric.cpuPercent / maxCpu) * 100, 18, 100),
      cpuLabel: formatCpuPercent(metric.cpuPercent, locale),
      label: metric.serviceName,
      memoryHeight: clamp((memoryPercent / maxMemory) * 100, 12, 100),
      memoryLabel: `${Math.round(memoryPercent)}%`,
    };
  });
};

const buildServiceRows = (
  metrics: MetricsDto[],
  locale: string,
): ServiceRow[] => {
  return metrics
    .slice()
    .sort((left, right) => {
      const leftScore =
        left.cpuPercent +
        calculateMemoryRatio(left) * 100 +
        left.networkRxBytes +
        left.networkTxBytes;
      const rightScore =
        right.cpuPercent +
        calculateMemoryRatio(right) * 100 +
        right.networkRxBytes +
        right.networkTxBytes;

      return rightScore - leftScore;
    })
    .slice(0, 5)
    .map((metric) => {
      return {
        cpu: formatCpuPercent(metric.cpuPercent, locale),
        memory: formatByteCount(metric.memoryUsageBytes, locale),
        name: metric.serviceName,
        status: resolveServiceStatus(metric),
        traffic: `${formatByteCount(metric.networkRxBytes, locale)} / ${formatByteCount(metric.networkTxBytes, locale)}`,
      };
    });
};

const ProtectedRoute = ({ authSession, children }: AuthRouteBoundaryProps) => {
  const redirectPath = resolveProtectedRouteRedirect(authSession);

  if (redirectPath) {
    return <Navigate replace to={redirectPath} />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute = ({ authSession, children }: AuthRouteBoundaryProps) => {
  const redirectPath = resolvePublicRouteRedirect(authSession);

  if (redirectPath) {
    return <Navigate replace to={redirectPath} />;
  }

  return <>{children}</>;
};

export const App = () => {
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const [authSession, setAuthSession] = useState<AuthDto | null>(() => {
    return readStoredAuthSession(getBrowserStorage());
  });
  const [loginEmail, setLoginEmail] = useState("admin@example.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [metricsProjectId, setMetricsProjectId] = useState(() => {
    return readStoredMetricsSession(getBrowserStorage()).projectId;
  });
  const [metrics, setMetrics] = useState<MetricsDto[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [lastMetricsUpdatedAt, setLastMetricsUpdatedAt] = useState<
    string | null
  >(null);
  const browserLocation = getBrowserLocation();
  const metricsApiBaseUrl = resolveMetricsApiBaseUrl(browserLocation);
  const sharedErrorExample = parseApiError({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
  const metricsAccessToken = authSession?.tokens.accessToken ?? "";
  const hasAuthSession = authSession !== null;
  const hasMetricsSession =
    hasAuthSession && metricsProjectId.trim().length > 0;
  const userInitials = createUserInitials(authSession);
  const handleAccessTokenExpired = useCallback(async () => {
    if (!authSession) {
      return null;
    }

    try {
      const nextSession = await refreshAuthSession({
        apiBaseUrl: metricsApiBaseUrl,
        refreshToken: authSession.tokens.refreshToken,
      });

      setAuthSession(nextSession);

      return nextSession.tokens.accessToken;
    } catch {
      setAuthError(t("app.auth.sessionExpired"));
      setAuthSession(null);
      navigate(loginRoutePath, {
        replace: true,
      });

      return null;
    }
  }, [authSession, metricsApiBaseUrl, navigate, t]);

  useEffect(() => {
    const storage = getBrowserStorage();

    if (authSession) {
      writeStoredAuthSession(storage, authSession);
    } else {
      clearStoredAuthSession(storage);
    }

    writeStoredMetricsSession(getBrowserStorage(), {
      projectId: metricsProjectId,
    });
  }, [authSession, metricsProjectId]);

  useEffect(() => {
    if (!hasMetricsSession) {
      setMetrics([]);
      setMetricsError(null);
      setIsMetricsLoading(false);
      setLastMetricsUpdatedAt(null);

      return;
    }

    setMetrics([]);
    setMetricsError(null);
    setLastMetricsUpdatedAt(null);

    const controller = createMetricsPollingController({
      accessToken: metricsAccessToken.trim(),
      apiBaseUrl: metricsApiBaseUrl,
      onAccessTokenExpired: handleAccessTokenExpired,
      onErrorChange: setMetricsError,
      onLoadingChange: setIsMetricsLoading,
      onMetricsChange: setMetrics,
      onUpdatedAtChange: setLastMetricsUpdatedAt,
      projectId: metricsProjectId.trim(),
    });

    void controller.start();

    return () => {
      controller.stop();
    };
  }, [
    handleAccessTokenExpired,
    hasMetricsSession,
    metricsAccessToken,
    metricsApiBaseUrl,
    metricsProjectId,
  ]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      const nextSession = await loginWithPassword({
        apiBaseUrl: metricsApiBaseUrl,
        email: loginEmail.trim(),
        password: loginPassword,
      });

      setAuthSession(nextSession);
      setLoginPassword("");
      navigate(dashboardRoutePath, {
        replace: true,
      });
    } catch (error) {
      setAuthError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t("app.auth.errorFallback"),
      );
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const currentSession = authSession;

    if (!currentSession) {
      return;
    }

    try {
      await logoutAuthSession({
        apiBaseUrl: metricsApiBaseUrl,
        refreshToken: currentSession.tokens.refreshToken,
      });
    } catch {
      // Local session cleanup must still happen for the MVP logout flow.
    } finally {
      setAuthError(null);
      setAuthSession(null);
      setLoginEmail(currentSession.user.email);
      setLoginPassword("");
      setMetrics([]);
      setMetricsError(null);
      setIsMetricsLoading(false);
      setLastMetricsUpdatedAt(null);
      navigate(loginRoutePath, {
        replace: true,
      });
    }
  };

  const totalMemoryUsage = sumMetricValues(metrics, (metric) => {
    return metric.memoryUsageBytes;
  });
  const totalMemoryLimit = sumMetricValues(metrics, (metric) => {
    return metric.memoryLimitBytes;
  });
  const totalNetworkRx = sumMetricValues(metrics, (metric) => {
    return metric.networkRxBytes;
  });
  const totalNetworkTx = sumMetricValues(metrics, (metric) => {
    return metric.networkTxBytes;
  });
  const averageCpu =
    metrics.length > 0
      ? sumMetricValues(metrics, (metric) => metric.cpuPercent) / metrics.length
      : 0;
  const peakCpu = metrics.reduce((peak, metric) => {
    return Math.max(peak, metric.cpuPercent);
  }, 0);
  const memoryHeadroom = Math.max(totalMemoryLimit - totalMemoryUsage, 0);
  const metricsStatus = !hasMetricsSession
    ? t("app.metrics.emptyConfig")
    : metricsError
      ? `${t("app.metrics.errorPrefix")} ${metricsError}`
      : isMetricsLoading && metrics.length === 0
        ? t("app.metrics.loading")
        : isMetricsLoading
          ? t("app.metrics.refreshing")
          : metrics.length === 0
            ? t("app.metrics.emptyData")
            : null;
  const runtimeTrend = createRuntimeTrend(metrics);
  const chart = buildChartPath(runtimeTrend);
  const pressureBars = buildPressureBars(metrics, locale);
  const serviceRows = buildServiceRows(metrics, locale);
  const sidebarItems = [
    {
      badge: t("app.nav.badges.live"),
      key: "dashboard",
      label: t("app.nav.dashboard"),
      routePath: dashboardRoutePath,
    },
    {
      badge: null,
      key: "projects",
      label: t("app.nav.projects"),
      routePath: projectsRoutePath,
    },
    {
      badge: null,
      key: "audit",
      label: t("app.nav.audit"),
      routePath: auditRoutePath,
    },
    {
      badge: formatCompactValue(metrics.length, locale),
      key: "services",
      label: t("app.nav.services"),
      routePath: null,
    },
    {
      badge: null,
      key: "deployments",
      label: t("app.nav.deployments"),
      routePath: null,
    },
    {
      badge: null,
      key: "logs",
      label: t("app.nav.logs"),
      routePath: null,
    },
    {
      badge: null,
      key: "settings",
      label: t("app.nav.settings"),
      routePath: null,
    },
  ];
  const topKpis = [
    {
      accentClassName: "kpi-accent-blue",
      detail: t("app.kpis.services.detail"),
      icon: "SRV",
      label: t("app.kpis.services.label"),
      value: formatCompactValue(metrics.length, locale),
    },
    {
      accentClassName: "kpi-accent-emerald",
      detail: t("app.kpis.cpu.detail"),
      icon: "CPU",
      label: t("app.kpis.cpu.label"),
      value: formatCpuPercent(averageCpu, locale),
    },
    {
      accentClassName: "kpi-accent-amber",
      detail: t("app.kpis.memory.detail"),
      icon: "RAM",
      label: t("app.kpis.memory.label"),
      value: formatByteCount(totalMemoryUsage, locale),
    },
    {
      accentClassName: "kpi-accent-rose",
      detail: t("app.kpis.traffic.detail"),
      icon: "NET",
      label: t("app.kpis.traffic.label"),
      value: formatByteCount(totalNetworkRx + totalNetworkTx, locale),
    },
  ];

  const loginScreen = (
    <main className="login-shell">
      <section className="login-aside">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            DA
          </div>

          <div>
            <p className="brand-eyebrow">{t("app.hero.eyebrow")}</p>
            <strong className="brand-title">DockerAdmin</strong>
          </div>
        </div>

        <div className="login-copy">
          <p className="page-crumbs">{t("app.auth.eyebrow")}</p>
          <h1>{t("app.auth.title")}</h1>
          <p className="page-summary">{t("app.auth.summary")}</p>
        </div>

        <div className="login-status-grid">
          <article className="tool-card login-status-card">
            <span className="tool-label">{t("app.auth.storageLabel")}</span>
            <strong>{t("app.auth.storageValue")}</strong>
            <p>{t("app.auth.storageHint")}</p>
          </article>

          <article className="tool-card login-status-card">
            <span className="tool-label">{t("app.tools.apiBaseLabel")}</span>
            <strong>{metricsApiBaseUrl}</strong>
            <p>{t("app.auth.apiHint")}</p>
          </article>
        </div>
      </section>

      <section className="login-panel-wrap">
        <article className="panel login-panel">
          <div className="panel-header">
            <div>
              <p className="panel-eyebrow">{t("app.auth.panelEyebrow")}</p>
              <h2>{t("app.auth.panelTitle")}</h2>
            </div>
            <span className="panel-pill">{t("app.auth.panelBadge")}</span>
          </div>

          <p className="panel-summary">{t("app.auth.panelSummary")}</p>

          <form className="login-form" onSubmit={handleLoginSubmit}>
            <div>
              <label className="field-label" htmlFor="login-email">
                {t("app.auth.emailLabel")}
              </label>
              <input
                autoComplete="username"
                className="text-input"
                id="login-email"
                placeholder={t("app.auth.emailPlaceholder")}
                type="email"
                value={loginEmail}
                onChange={(event) => {
                  setLoginEmail(event.target.value);
                }}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="login-password">
                {t("app.auth.passwordLabel")}
              </label>
              <input
                autoComplete="current-password"
                className="text-input"
                id="login-password"
                placeholder={t("app.auth.passwordPlaceholder")}
                type="password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                }}
              />
            </div>

            <button
              className="primary-button"
              disabled={isAuthLoading}
              type="submit"
            >
              {isAuthLoading
                ? t("app.auth.submitLoading")
                : t("app.auth.submitIdle")}
            </button>

            <p className={`field-hint${authError ? " field-hint-error" : ""}`}>
              {authError ?? t("app.auth.hint")}
            </p>
          </form>

          <div className="tool-card login-locale-card">
            <span className="tool-label">{t("app.tools.localeLabel")}</span>
            <label
              className="field-label visually-hidden"
              htmlFor="login-language-select"
            >
              {t("settings.language.label")}
            </label>
            <select
              className="language-select"
              id="login-language-select"
              value={locale}
              onChange={(event) => {
                setLocale(resolveLocale(event.target.value));
              }}
            >
              {supportedLocales.map((localeCode) => {
                return (
                  <option key={localeCode} value={localeCode}>
                    {t(`common.locales.${localeCode}`)}
                  </option>
                );
              })}
            </select>
            <p>{t("settings.language.hint")}</p>
          </div>
        </article>
      </section>
    </main>
  );

  const dashboardScreen = (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            DA
          </div>

          <div>
            <p className="brand-eyebrow">{t("app.hero.eyebrow")}</p>
            <strong className="brand-title">DockerAdmin</strong>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("app.nav.ariaLabel")}>
          {sidebarItems.map((item) => {
            const isActive = item.key === "dashboard";

            return (
              <button
                key={item.key}
                className={`sidebar-link${isActive ? " sidebar-link-active" : ""}`}
                type="button"
                onClick={() => {
                  if (item.routePath) {
                    navigate(item.routePath);
                  }
                }}
              >
                <span className="sidebar-link-label">{item.label}</span>
                {item.badge ? (
                  <span className="sidebar-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">
            {t("app.sidebar.environmentLabel")}
          </p>
          <p className="sidebar-footer-value">
            {hasMetricsSession
              ? t("app.sidebar.environmentConnected")
              : t("app.sidebar.environmentPending")}
          </p>

          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div>
              <strong>{authSession?.user.email ?? ""}</strong>
              <p>{authSession?.user.role ?? ""}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">
              /
            </span>
            <input
              aria-label={t("app.topbar.searchPlaceholder")}
              className="topbar-search-input"
              placeholder={t("app.topbar.searchPlaceholder")}
              type="search"
            />
            <span className="topbar-command-pill">
              {t("app.topbar.commandHint")}
            </span>
          </div>

          <div className="topbar-meta">
            <span className="topbar-pill topbar-pill-live">
              {hasMetricsSession
                ? t("app.topbar.sessionLive")
                : t("app.topbar.sessionPending")}
            </span>
            <span className="topbar-pill">
              {metricsError
                ? t("app.topbar.alertsWarning")
                : t("app.topbar.alertsCalm")}
            </span>
            <div className="topbar-user">
              <div className="topbar-user-avatar" aria-hidden="true">
                {userInitials}
              </div>
              <div>
                <strong>{authSession?.user.email ?? ""}</strong>
                <p>{authSession?.user.role ?? ""}</p>
              </div>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
            >
              {t("app.auth.logout")}
            </button>
          </div>
        </header>

        <div className="workspace-canvas">
          <section className="page-heading">
            <p className="page-crumbs">
              {t("app.hero.breadcrumbLabel")} /{" "}
              {t("app.hero.breadcrumbCurrent")}
            </p>
            <h1>{t("app.hero.title")}</h1>
            <p className="page-summary">{t("app.hero.summary")}</p>
          </section>

          <section className="kpi-grid">
            {topKpis.map((kpi) => {
              return (
                <article key={kpi.label} className="panel kpi-card">
                  <div className="kpi-copy">
                    <p className="kpi-label">{kpi.label}</p>
                    <strong className="kpi-value">{kpi.value}</strong>
                    <p className="kpi-detail">{kpi.detail}</p>
                  </div>
                  <div className={`kpi-accent ${kpi.accentClassName}`}>
                    {kpi.icon}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="dashboard-grid dashboard-grid-feature">
            <article className="panel panel-runtime">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">{t("app.metrics.title")}</p>
                  <h2>{t("app.runtime.overviewTitle")}</h2>
                </div>
                <span className="panel-pill">
                  {metrics.length > 0
                    ? t("app.runtime.liveBadge")
                    : t("app.runtime.demoBadge")}
                </span>
              </div>

              <p className="panel-summary">
                {t("app.runtime.overviewSummary")}
              </p>

              <div className="runtime-grid">
                <div className="runtime-chart-card">
                  <svg
                    aria-hidden="true"
                    className="runtime-chart"
                    viewBox={`0 0 ${chart.width} ${chart.height}`}
                  >
                    <defs>
                      <linearGradient
                        id="runtimeAreaFill"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="rgba(52, 115, 255, 0.35)"
                        />
                        <stop
                          offset="100%"
                          stopColor="rgba(52, 115, 255, 0.02)"
                        />
                      </linearGradient>
                    </defs>

                    {[0.2, 0.4, 0.6, 0.8].map((offset) => {
                      const y = chart.height * offset;

                      return (
                        <line
                          key={offset}
                          x1="0"
                          x2={chart.width}
                          y1={y}
                          y2={y}
                          className="runtime-chart-grid"
                        />
                      );
                    })}

                    <path className="runtime-chart-area" d={chart.areaPath} />
                    <path className="runtime-chart-line" d={chart.linePath} />
                    {chart.points.map((point, index) => {
                      return (
                        <circle
                          key={`${point.x}-${point.y}-${index}`}
                          className="runtime-chart-point"
                          cx={point.x}
                          cy={point.y}
                          r="4"
                        />
                      );
                    })}
                  </svg>

                  <div className="runtime-chart-footer">
                    <div>
                      <span className="runtime-chart-label">
                        {t("app.runtime.peakCpuLabel")}
                      </span>
                      <strong>{formatCpuPercent(peakCpu, locale)}</strong>
                    </div>
                    <div>
                      <span className="runtime-chart-label">
                        {t("app.runtime.memoryHeadroomLabel")}
                      </span>
                      <strong>{formatByteCount(memoryHeadroom, locale)}</strong>
                    </div>
                    <div>
                      <span className="runtime-chart-label">
                        {t("app.runtime.lastUpdatedLabel")}
                      </span>
                      <strong>
                        {lastMetricsUpdatedAt
                          ? formatUpdatedAt(lastMetricsUpdatedAt, locale)
                          : t("app.runtime.awaitingUpdate")}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="runtime-sidebar">
                  <div className="runtime-sidebar-card">
                    <span className="runtime-sidebar-label">
                      {t("app.runtime.connectionLabel")}
                    </span>
                    <strong>
                      {hasMetricsSession
                        ? t("app.runtime.connectionReady")
                        : t("app.runtime.connectionPending")}
                    </strong>
                    <p>{metricsStatus ?? t("app.runtime.connectionHealthy")}</p>
                  </div>

                  <div className="runtime-sidebar-card">
                    <span className="runtime-sidebar-label">
                      {t("app.runtime.projectLabel")}
                    </span>
                    <strong>
                      {metricsProjectId.trim().length > 0
                        ? metricsProjectId.trim()
                        : t("app.runtime.projectPlaceholder")}
                    </strong>
                    <p>{metricsApiBaseUrl}</p>
                  </div>
                </div>
              </div>
            </article>

            <article className="panel panel-pressure">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">{t("app.pressure.eyebrow")}</p>
                  <h2>{t("app.pressure.title")}</h2>
                </div>
              </div>

              <p className="panel-summary">{t("app.pressure.summary")}</p>

              <div className="pressure-chart">
                {pressureBars.map((bar) => {
                  return (
                    <div key={bar.label} className="pressure-column">
                      <div className="pressure-bars">
                        <div
                          className="pressure-bar pressure-bar-memory"
                          style={{ height: `${bar.memoryHeight}%` }}
                          title={`${t("app.pressure.memoryLegend")} ${bar.memoryLabel}`}
                        />
                        <div
                          className="pressure-bar pressure-bar-cpu"
                          style={{ height: `${bar.cpuHeight}%` }}
                          title={`${t("app.pressure.cpuLegend")} ${bar.cpuLabel}`}
                        />
                      </div>
                      <div className="pressure-meta">
                        <strong>{bar.label}</strong>
                        <span>{bar.cpuLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="panel-legend">
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch-memory" />
                  {t("app.pressure.memoryLegend")}
                </span>
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch-cpu" />
                  {t("app.pressure.cpuLegend")}
                </span>
              </div>
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid-secondary">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">{t("app.services.eyebrow")}</p>
                  <h2>{t("app.services.title")}</h2>
                </div>
                <span className="panel-pill">
                  {formatCompactValue(metrics.length, locale)}
                </span>
              </div>

              <p className="panel-summary">{t("app.services.summary")}</p>

              {serviceRows.length > 0 ? (
                <div className="services-table-wrap">
                  <table className="services-table">
                    <thead>
                      <tr>
                        <th>{t("app.metrics.columns.service")}</th>
                        <th>{t("app.metrics.columns.cpu")}</th>
                        <th>{t("app.metrics.columns.memoryUsage")}</th>
                        <th>{t("app.services.trafficColumn")}</th>
                        <th>{t("app.services.statusColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceRows.map((row) => {
                        return (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.cpu}</td>
                            <td>{row.memory}</td>
                            <td>{row.traffic}</td>
                            <td>
                              <span
                                className={`status-pill status-pill-${row.status}`}
                              >
                                {t(`app.services.status.${row.status}`)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">{t("app.services.empty")}</p>
              )}
            </article>

            <article className="panel panel-tools">
              <div className="panel-header">
                <div>
                  <p className="panel-eyebrow">{t("app.tools.eyebrow")}</p>
                  <h2>{t("app.tools.title")}</h2>
                </div>
              </div>

              <p className="panel-summary">{t("app.tools.summary")}</p>

              <div className="field-grid">
                <div>
                  <label className="field-label" htmlFor="metrics-project-id">
                    {t("app.metrics.projectIdLabel")}
                  </label>
                  <input
                    className="text-input"
                    id="metrics-project-id"
                    placeholder={t("app.metrics.projectIdPlaceholder")}
                    type="text"
                    value={metricsProjectId}
                    onChange={(event) => {
                      setMetricsProjectId(event.target.value);
                    }}
                  />
                  <p className="field-hint">{t("app.metrics.projectIdHint")}</p>
                </div>

                <div className="tool-card">
                  <span className="tool-label">
                    {t("app.auth.sessionLabel")}
                  </span>
                  <strong>{authSession?.user.email ?? ""}</strong>
                  <p>{t("app.auth.sessionHint")}</p>
                </div>
              </div>

              <div className="tools-grid">
                <div className="tool-card">
                  <span className="tool-label">
                    {t("app.tools.localeLabel")}
                  </span>
                  <label
                    className="field-label visually-hidden"
                    htmlFor="language-select"
                  >
                    {t("settings.language.label")}
                  </label>
                  <select
                    className="language-select"
                    id="language-select"
                    value={locale}
                    onChange={(event) => {
                      setLocale(resolveLocale(event.target.value));
                    }}
                  >
                    {supportedLocales.map((localeCode) => {
                      return (
                        <option key={localeCode} value={localeCode}>
                          {t(`common.locales.${localeCode}`)}
                        </option>
                      );
                    })}
                  </select>
                  <p>{t("settings.language.hint")}</p>
                </div>

                <div className="tool-card">
                  <span className="tool-label">
                    {t("app.tools.apiBaseLabel")}
                  </span>
                  <strong>{metricsApiBaseUrl}</strong>
                  <p>{t("app.metrics.intervalHint")}</p>
                </div>

                {sharedErrorExample ? (
                  <div className="tool-card tool-card-wide">
                    <span className="tool-label">{t("app.error.title")}</span>
                    <strong>
                      {sharedErrorExample.error.code} /{" "}
                      {sharedErrorExample.error.message}
                    </strong>
                    <p>{t("app.error.summaryPrefix")}</p>
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );

  const projectsScreen = (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            DA
          </div>

          <div>
            <p className="brand-eyebrow">{t("app.hero.eyebrow")}</p>
            <strong className="brand-title">DockerAdmin</strong>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("app.nav.ariaLabel")}>
          {sidebarItems.map((item) => {
            const isActive = item.key === "projects";

            return (
              <button
                key={item.key}
                className={`sidebar-link${isActive ? " sidebar-link-active" : ""}`}
                type="button"
                onClick={() => {
                  if (item.routePath) {
                    navigate(item.routePath);
                  }
                }}
              >
                <span className="sidebar-link-label">{item.label}</span>
                {item.badge ? (
                  <span className="sidebar-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">
            {t("app.sidebar.environmentLabel")}
          </p>
          <p className="sidebar-footer-value">
            {hasMetricsSession
              ? t("app.sidebar.environmentConnected")
              : t("app.sidebar.environmentPending")}
          </p>

          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div>
              <strong>{authSession?.user.email ?? ""}</strong>
              <p>{authSession?.user.role ?? ""}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">
              /
            </span>
            <input
              aria-label={t("app.topbar.searchPlaceholder")}
              className="topbar-search-input"
              placeholder={t("app.topbar.searchPlaceholder")}
              type="search"
            />
            <span className="topbar-command-pill">
              {t("app.topbar.commandHint")}
            </span>
          </div>

          <div className="topbar-meta">
            <span className="topbar-pill topbar-pill-live">
              {hasMetricsSession
                ? t("app.topbar.sessionLive")
                : t("app.topbar.sessionPending")}
            </span>
            <span className="topbar-pill">
              {metricsError
                ? t("app.topbar.alertsWarning")
                : t("app.topbar.alertsCalm")}
            </span>
            <div className="topbar-user">
              <div className="topbar-user-avatar" aria-hidden="true">
                {userInitials}
              </div>
              <div>
                <strong>{authSession?.user.email ?? ""}</strong>
                <p>{authSession?.user.role ?? ""}</p>
              </div>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
            >
              {t("app.auth.logout")}
            </button>
          </div>
        </header>

        <div className="workspace-canvas">
          <section className="page-heading">
            <p className="page-crumbs">
              {t("app.projects.breadcrumbLabel")} /{" "}
              {t("app.projects.breadcrumbCurrent")}
            </p>
            <h1>{t("app.projects.pageTitle")}</h1>
            <p className="page-summary">{t("app.projects.pageSummary")}</p>
          </section>

          <ProjectsPage
            accessToken={metricsAccessToken.trim()}
            apiBaseUrl={metricsApiBaseUrl}
            onAccessTokenExpired={handleAccessTokenExpired}
          />
        </div>
      </section>
    </main>
  );

  const auditScreen = (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            DA
          </div>

          <div>
            <p className="brand-eyebrow">{t("app.hero.eyebrow")}</p>
            <strong className="brand-title">DockerAdmin</strong>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("app.nav.ariaLabel")}>
          {sidebarItems.map((item) => {
            const isActive = item.key === "audit";

            return (
              <button
                key={item.key}
                className={`sidebar-link${isActive ? " sidebar-link-active" : ""}`}
                type="button"
                onClick={() => {
                  if (item.routePath) {
                    navigate(item.routePath);
                  }
                }}
              >
                <span className="sidebar-link-label">{item.label}</span>
                {item.badge ? (
                  <span className="sidebar-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">
            {t("app.sidebar.environmentLabel")}
          </p>
          <p className="sidebar-footer-value">
            {hasMetricsSession
              ? t("app.sidebar.environmentConnected")
              : t("app.sidebar.environmentPending")}
          </p>

          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div>
              <strong>{authSession?.user.email ?? ""}</strong>
              <p>{authSession?.user.role ?? ""}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">
              /
            </span>
            <input
              aria-label={t("app.topbar.searchPlaceholder")}
              className="topbar-search-input"
              placeholder={t("app.topbar.searchPlaceholder")}
              type="search"
            />
            <span className="topbar-command-pill">
              {t("app.topbar.commandHint")}
            </span>
          </div>

          <div className="topbar-meta">
            <span className="topbar-pill topbar-pill-live">
              {hasMetricsSession
                ? t("app.topbar.sessionLive")
                : t("app.topbar.sessionPending")}
            </span>
            <span className="topbar-pill">
              {metricsError
                ? t("app.topbar.alertsWarning")
                : t("app.topbar.alertsCalm")}
            </span>
            <div className="topbar-user">
              <div className="topbar-user-avatar" aria-hidden="true">
                {userInitials}
              </div>
              <div>
                <strong>{authSession?.user.email ?? ""}</strong>
                <p>{authSession?.user.role ?? ""}</p>
              </div>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
            >
              {t("app.auth.logout")}
            </button>
          </div>
        </header>

        <div className="workspace-canvas">
          <section className="page-heading">
            <p className="page-crumbs">
              {t("app.audit.breadcrumbLabel")} /{" "}
              {t("app.audit.breadcrumbCurrent")}
            </p>
            <h1>{t("app.audit.pageTitle")}</h1>
            <p className="page-summary">{t("app.audit.pageSummary")}</p>
          </section>

          <AuditPage
            accessToken={metricsAccessToken.trim()}
            apiBaseUrl={metricsApiBaseUrl}
            onAccessTokenExpired={handleAccessTokenExpired}
          />
        </div>
      </section>
    </main>
  );

  const projectDetailScreen = (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            DA
          </div>

          <div>
            <p className="brand-eyebrow">{t("app.hero.eyebrow")}</p>
            <strong className="brand-title">DockerAdmin</strong>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("app.nav.ariaLabel")}>
          {sidebarItems.map((item) => {
            const isActive = item.key === "projects";

            return (
              <button
                key={item.key}
                className={`sidebar-link${isActive ? " sidebar-link-active" : ""}`}
                type="button"
                onClick={() => {
                  if (item.routePath) {
                    navigate(item.routePath);
                  }
                }}
              >
                <span className="sidebar-link-label">{item.label}</span>
                {item.badge ? (
                  <span className="sidebar-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">
            {t("app.sidebar.environmentLabel")}
          </p>
          <p className="sidebar-footer-value">
            {hasMetricsSession
              ? t("app.sidebar.environmentConnected")
              : t("app.sidebar.environmentPending")}
          </p>

          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div>
              <strong>{authSession?.user.email ?? ""}</strong>
              <p>{authSession?.user.role ?? ""}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">
              /
            </span>
            <input
              aria-label={t("app.topbar.searchPlaceholder")}
              className="topbar-search-input"
              placeholder={t("app.topbar.searchPlaceholder")}
              type="search"
            />
            <span className="topbar-command-pill">
              {t("app.topbar.commandHint")}
            </span>
          </div>

          <div className="topbar-meta">
            <span className="topbar-pill topbar-pill-live">
              {hasMetricsSession
                ? t("app.topbar.sessionLive")
                : t("app.topbar.sessionPending")}
            </span>
            <span className="topbar-pill">
              {metricsError
                ? t("app.topbar.alertsWarning")
                : t("app.topbar.alertsCalm")}
            </span>
            <div className="topbar-user">
              <div className="topbar-user-avatar" aria-hidden="true">
                {userInitials}
              </div>
              <div>
                <strong>{authSession?.user.email ?? ""}</strong>
                <p>{authSession?.user.role ?? ""}</p>
              </div>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
            >
              {t("app.auth.logout")}
            </button>
          </div>
        </header>

        <div className="workspace-canvas">
          <ProjectDetailPage
            accessToken={metricsAccessToken.trim()}
            apiBaseUrl={metricsApiBaseUrl}
            onAccessTokenExpired={handleAccessTokenExpired}
          />
        </div>
      </section>
    </main>
  );

  return (
    <Routes>
      <Route
        path={loginRoutePath}
        element={
          <PublicOnlyRoute authSession={authSession}>
            {loginScreen}
          </PublicOnlyRoute>
        }
      />
      <Route
        path={dashboardRoutePath}
        element={
          <ProtectedRoute authSession={authSession}>
            {dashboardScreen}
          </ProtectedRoute>
        }
      />
      <Route
        path={auditRoutePath}
        element={
          <ProtectedRoute authSession={authSession}>
            {auditScreen}
          </ProtectedRoute>
        }
      />
      <Route
        path={projectsRoutePath}
        element={
          <ProtectedRoute authSession={authSession}>
            {projectsScreen}
          </ProtectedRoute>
        }
      />
      <Route
        path={projectDetailBaseRoutePattern}
        element={
          <ProtectedRoute authSession={authSession}>
            <ProjectDetailRouteRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path={projectDetailTabRoutePattern}
        element={
          <ProtectedRoute authSession={authSession}>
            {projectDetailScreen}
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <Navigate replace to={resolveUnknownRouteRedirect(authSession)} />
        }
      />
    </Routes>
  );
};
