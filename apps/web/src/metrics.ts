import {
  type MetricsDto,
  MetricsListSchema,
  parseApiError,
} from "@dockeradmin/shared";

export const metricsProjectIdStorageKey = "dockeradmin.metrics.projectId";
export const metricsPollingIntervalMs = 5_000;

type MetricsStorageReader = Pick<Storage, "getItem">;
type MetricsStorageWriter = Pick<Storage, "setItem">;
type IntervalHandle = ReturnType<typeof setInterval>;
type IntervalScheduler = (
  callback: () => void,
  delay: number,
) => IntervalHandle;
type IntervalClearer = (handle: IntervalHandle) => void;

type MetricsSession = {
  projectId: string;
};

type LocationLike = Pick<Location, "origin" | "port">;

type MetricsPollingController = {
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
};

type CreateMetricsPollingControllerOptions = {
  accessToken: string;
  apiBaseUrl: string;
  clearScheduledInterval?: IntervalClearer;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  now?: () => Date;
  onErrorChange: (message: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onMetricsChange: (metrics: MetricsDto[]) => void;
  onUpdatedAtChange: (updatedAt: string | null) => void;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
  scheduleInterval?: IntervalScheduler;
};

const defaultFetchImpl = (...args: Parameters<typeof fetch>) => {
  return fetch(...args);
};

const readStoredValue = (
  storage: MetricsStorageReader | null,
  key: string,
): string => {
  return storage?.getItem(key) ?? "";
};

const createMetricsApiUrl = (input: {
  apiBaseUrl: string;
  projectId: string;
}): string => {
  const url = new URL("/api/metrics", input.apiBaseUrl);

  url.searchParams.set("projectId", input.projectId);

  return url.toString();
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to load metrics";
};

const isAbortError = (error: unknown): boolean => {
  return error instanceof Error && error.name === "AbortError";
};

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const readStoredMetricsSession = (
  storage: MetricsStorageReader | null,
): MetricsSession => {
  return {
    projectId: readStoredValue(storage, metricsProjectIdStorageKey),
  };
};

export const writeStoredMetricsSession = (
  storage: MetricsStorageWriter | null,
  session: MetricsSession,
) => {
  storage?.setItem(metricsProjectIdStorageKey, session.projectId);
};

export const resolveMetricsApiBaseUrl = (
  location: LocationLike | null | undefined,
): string => {
  if (!location) {
    return "http://localhost:3001";
  }

  return location.port === "5173" ? "http://localhost:3001" : location.origin;
};

export const loadProjectMetrics = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
  signal?: AbortSignal;
}): Promise<MetricsDto[]> => {
  const executeRequest = async (accessToken: string) => {
    const requestInit: RequestInit = {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    };

    if (input.signal) {
      requestInit.signal = input.signal;
    }

    return (input.fetchImpl ?? defaultFetchImpl)(
      createMetricsApiUrl({
        apiBaseUrl: input.apiBaseUrl,
        projectId: input.projectId,
      }),
      requestInit,
    );
  };

  let response = await executeRequest(input.accessToken);

  if (response.status === 401 && input.onAccessTokenExpired) {
    const refreshedAccessToken = await input.onAccessTokenExpired();

    if (refreshedAccessToken) {
      response = await executeRequest(refreshedAccessToken);
    }
  }

  const body = await safeParseJson(response);

  if (!response.ok) {
    const apiError = parseApiError(body);

    throw new Error(apiError?.error.message ?? "Failed to load metrics");
  }

  try {
    return MetricsListSchema.parse(body);
  } catch {
    throw new Error("Metrics response does not match the shared DTO contract");
  }
};

export const createMetricsPollingController = ({
  accessToken,
  apiBaseUrl,
  clearScheduledInterval = clearInterval,
  fetchImpl = defaultFetchImpl,
  intervalMs = metricsPollingIntervalMs,
  now = () => new Date(),
  onErrorChange,
  onAccessTokenExpired,
  onLoadingChange,
  onMetricsChange,
  onUpdatedAtChange,
  projectId,
  scheduleInterval = setInterval,
}: CreateMetricsPollingControllerOptions): MetricsPollingController => {
  let activeAbortController: AbortController | null = null;
  let inFlight = false;
  let intervalId: IntervalHandle | null = null;
  let stopped = false;

  const refresh = async () => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    onErrorChange(null);
    onLoadingChange(true);

    const abortController = new AbortController();

    activeAbortController = abortController;

    try {
      const metrics = await loadProjectMetrics(
        onAccessTokenExpired
          ? {
              accessToken,
              apiBaseUrl,
              fetchImpl,
              onAccessTokenExpired,
              projectId,
              signal: abortController.signal,
            }
          : {
              accessToken,
              apiBaseUrl,
              fetchImpl,
              projectId,
              signal: abortController.signal,
            },
      );

      if (stopped || activeAbortController !== abortController) {
        return;
      }

      onMetricsChange(metrics);
      onUpdatedAtChange(now().toISOString());
    } catch (error) {
      if (
        stopped ||
        activeAbortController !== abortController ||
        isAbortError(error)
      ) {
        return;
      }

      onErrorChange(toErrorMessage(error));
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }

      inFlight = false;

      if (!stopped) {
        onLoadingChange(false);
      }
    }
  };

  return {
    refresh,
    async start() {
      if (stopped || intervalId !== null) {
        return;
      }

      intervalId = scheduleInterval(() => {
        void refresh();
      }, intervalMs);

      await refresh();
    },
    stop() {
      stopped = true;

      if (intervalId !== null) {
        clearScheduledInterval(intervalId);
        intervalId = null;
      }

      activeAbortController?.abort();
      activeAbortController = null;
      onLoadingChange(false);
    },
  };
};
