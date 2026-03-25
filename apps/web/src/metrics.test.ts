import assert from "node:assert/strict";
import test from "node:test";

import type { MetricsDto } from "@dockeradmin/shared";

import {
  createMetricsPollingController,
  loadProjectMetrics,
  metricsProjectIdStorageKey,
  readStoredMetricsSession,
  resolveMetricsApiBaseUrl,
  writeStoredMetricsSession,
} from "./metrics.js";

const createIntervalHandle = (): ReturnType<typeof setInterval> => {
  const handle = setInterval(() => {}, 60_000);

  clearInterval(handle);

  return handle;
};

const createMetricsFixture = (
  overrides: Partial<MetricsDto> = {},
): MetricsDto => ({
  cpuPercent: 1.25,
  memoryLimitBytes: 268435456,
  memoryUsageBytes: 73400320,
  networkRxBytes: 1024,
  networkTxBytes: 2048,
  serviceName: "api",
  ...overrides,
});

test("resolveMetricsApiBaseUrl uses the API port in Vite dev and the current origin elsewhere", () => {
  assert.equal(
    resolveMetricsApiBaseUrl({
      origin: "http://localhost:5173",
      port: "5173",
    }),
    "http://localhost:3001",
  );
  assert.equal(
    resolveMetricsApiBaseUrl({
      origin: "http://localhost",
      port: "",
    }),
    "http://localhost",
  );
});

test("readStoredMetricsSession restores saved values and writeStoredMetricsSession persists them", () => {
  const writes = new Map<string, string>();
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, metricsProjectIdStorageKey);

      return "project_1";
    },
    setItem: (key: string, value: string) => {
      writes.set(key, value);
    },
  };

  assert.deepEqual(readStoredMetricsSession(storage), {
    projectId: "project_1",
  });

  writeStoredMetricsSession(storage, {
    projectId: "project_2",
  });

  assert.deepEqual(Array.from(writes.entries()), [
    [metricsProjectIdStorageKey, "project_2"],
  ]);
});

test("loadProjectMetrics calls the guarded metrics endpoint and parses the shared DTO list", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    url: string;
  }> = [];

  const result = await loadProjectMetrics({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        url: String(input),
      });

      return new Response(
        JSON.stringify([
          createMetricsFixture(),
          createMetricsFixture({
            cpuPercent: 0,
            memoryLimitBytes: 0,
            memoryUsageBytes: 0,
            networkRxBytes: 0,
            networkTxBytes: 0,
            serviceName: "worker",
          }),
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      url: "http://localhost:3001/api/metrics?projectId=project_1",
    },
  ]);
  assert.deepEqual(result, [
    createMetricsFixture(),
    createMetricsFixture({
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "worker",
    }),
  ]);
});

test("createMetricsPollingController loads immediately, schedules the next refresh, and reports loading state", async () => {
  let fetchCallCount = 0;
  const loadingStates: boolean[] = [];
  const metricsSnapshots: MetricsDto[][] = [];
  const updateTimestamps: Array<string | null> = [];
  let scheduledCallback: (() => void) | null = null;
  const intervalHandle = createIntervalHandle();

  const controller = createMetricsPollingController({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async () => {
      fetchCallCount += 1;

      return new Response(
        JSON.stringify([
          createMetricsFixture({
            cpuPercent: fetchCallCount,
          }),
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    now: () => new Date("2026-03-20T12:15:00.000Z"),
    onErrorChange: () => {},
    onLoadingChange: (isLoading) => {
      loadingStates.push(isLoading);
    },
    onMetricsChange: (metrics) => {
      metricsSnapshots.push(metrics);
    },
    onUpdatedAtChange: (updatedAt) => {
      updateTimestamps.push(updatedAt);
    },
    projectId: "project_1",
    scheduleInterval: (callback, _delay) => {
      scheduledCallback = callback;

      return intervalHandle;
    },
  });

  await controller.start();

  assert.equal(fetchCallCount, 1);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(metricsSnapshots, [
    [createMetricsFixture({ cpuPercent: 1 })],
  ]);
  assert.deepEqual(updateTimestamps, ["2026-03-20T12:15:00.000Z"]);
  assert.ok(scheduledCallback);

  const nextRefresh = scheduledCallback as (() => void) | null;

  if (!nextRefresh) {
    throw new Error("Expected scheduled callback");
  }

  nextRefresh();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  assert.equal(fetchCallCount, 2);
  assert.deepEqual(metricsSnapshots, [
    [createMetricsFixture({ cpuPercent: 1 })],
    [createMetricsFixture({ cpuPercent: 2 })],
  ]);
});

test("createMetricsPollingController reports shared API errors and aborts in-flight work on stop", async () => {
  let capturedSignal: AbortSignal | null = null;
  const clearedIntervals: Array<ReturnType<typeof setInterval>> = [];
  const errorMessages: Array<string | null> = [];
  const intervalHandle = createIntervalHandle();

  const controller = createMetricsPollingController({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    clearScheduledInterval: (intervalId) => {
      clearedIntervals.push(intervalId);
    },
    fetchImpl: async (_input, init) => {
      capturedSignal = init?.signal ?? null;

      return await new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          reject(
            Object.assign(new Error("Aborted"), {
              name: "AbortError",
            }),
          );
        });
      });
    },
    onErrorChange: (message) => {
      errorMessages.push(message);
    },
    onLoadingChange: () => {},
    onMetricsChange: () => {},
    onUpdatedAtChange: () => {},
    projectId: "project_1",
    scheduleInterval: (_callback, _delay) => {
      return intervalHandle;
    },
  });

  const startPromise = controller.start();

  controller.stop();

  await startPromise;

  if (!capturedSignal) {
    throw new Error("Expected polling signal");
  }

  assert.equal((capturedSignal as AbortSignal).aborted, true);
  assert.deepEqual(clearedIntervals, [intervalHandle]);
  assert.deepEqual(errorMessages, [null]);
});

test("loadProjectMetrics surfaces the standardized API error message on failure", async () => {
  await assert.rejects(
    async () => {
      await loadProjectMetrics({
        accessToken: "token_1",
        apiBaseUrl: "http://localhost:3001",
        fetchImpl: async () => {
          return new Response(
            JSON.stringify({
              error: {
                code: "UNAUTHORIZED",
                message: "Authentication required",
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 401,
            },
          );
        },
        projectId: "project_1",
      });
    },
    (error: unknown) => {
      return (
        error instanceof Error && error.message === "Authentication required"
      );
    },
  );
});

test("loadProjectMetrics retries once with a refreshed access token after a 401 response", async () => {
  const seenAuthorizationHeaders: string[] = [];
  let refreshCalls = 0;

  const result = await loadProjectMetrics({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (_input, init) => {
      const authorizationHeader =
        new Headers(init?.headers).get("authorization") ?? "";

      seenAuthorizationHeaders.push(authorizationHeader);

      if (authorizationHeader === "Bearer token_1") {
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired access token",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 401,
          },
        );
      }

      return new Response(JSON.stringify([createMetricsFixture()]), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    onAccessTokenExpired: async () => {
      refreshCalls += 1;

      return "token_2";
    },
    projectId: "project_1",
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(seenAuthorizationHeaders, [
    "Bearer token_1",
    "Bearer token_2",
  ]);
  assert.deepEqual(result, [createMetricsFixture()]);
});
