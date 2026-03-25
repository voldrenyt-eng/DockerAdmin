import assert from "node:assert/strict";
import test from "node:test";

import type { MetricsDto, ServiceDto } from "@dockeradmin/shared";

import { AppError } from "../errors.js";
import { createProjectRepository } from "../projects/repository.js";
import { createMetricsService } from "./service.js";

const createServiceFixture = (
  overrides: Partial<ServiceDto> = {},
): ServiceDto => ({
  containerName: "demo-api-1",
  image: "nginx:1.27",
  ports: ["8080->80/tcp"],
  serviceName: "api",
  startedAt: "2026-03-20T10:00:00.000Z",
  status: "running",
  ...overrides,
});

test("createMetricsService loads the project, lists runtime services by project slug, and returns normalized metrics", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T09:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
      },
    ],
  });
  const seenListInputs: Array<{ projectSlug: string }> = [];
  const seenReadInputs: Array<{ services: ServiceDto[] }> = [];
  const metricsService = createMetricsService({
    listProjectRuntimeServices: async (input) => {
      seenListInputs.push(input);

      return [
        createServiceFixture(),
        createServiceFixture({
          containerName: "demo-worker-1",
          serviceName: "worker",
          status: "stopped",
        }),
      ];
    },
    projectRepository,
    readProjectRuntimeMetrics: async (input) => {
      seenReadInputs.push(input);

      return [
        {
          cpuPercent: 1.25,
          memoryLimitBytes: 268435456,
          memoryUsageBytes: 73400320,
          networkRxBytes: 1024,
          networkTxBytes: 2048,
          serviceName: "api",
        },
        {
          cpuPercent: 0,
          memoryLimitBytes: 0,
          memoryUsageBytes: 0,
          networkRxBytes: 0,
          networkTxBytes: 0,
          serviceName: "worker",
        },
      ] satisfies MetricsDto[];
    },
  });

  const result = await metricsService.listProjectMetrics({
    projectId: "project_1",
  });

  assert.deepEqual(seenListInputs, [{ projectSlug: "demo-project" }]);
  assert.equal(seenReadInputs.length, 1);
  assert.deepEqual(seenReadInputs[0]?.services, [
    createServiceFixture(),
    createServiceFixture({
      containerName: "demo-worker-1",
      serviceName: "worker",
      status: "stopped",
    }),
  ]);
  assert.deepEqual(result, [
    {
      cpuPercent: 1.25,
      memoryLimitBytes: 268435456,
      memoryUsageBytes: 73400320,
      networkRxBytes: 1024,
      networkTxBytes: 2048,
      serviceName: "api",
    },
    {
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "worker",
    },
  ]);
});

test("createMetricsService returns a standardized 404 when the project is missing", async () => {
  const metricsService = createMetricsService({
    listProjectRuntimeServices: async () => {
      return [createServiceFixture()];
    },
    projectRepository: createProjectRepository(),
    readProjectRuntimeMetrics: async () => {
      return [];
    },
  });

  await assert.rejects(
    async () => {
      await metricsService.listProjectMetrics({
        projectId: "project_missing",
      });
    },
    (error: unknown) => {
      return (
        error instanceof AppError &&
        error.code === "NOT_FOUND" &&
        error.message === "Project not found"
      );
    },
  );
});

test("createMetricsService returns metrics sorted by serviceName for a stable API order", async () => {
  const metricsService = createMetricsService({
    listProjectRuntimeServices: async () => {
      return [
        createServiceFixture({
          containerName: "demo-worker-1",
          serviceName: "worker",
        }),
        createServiceFixture({
          containerName: "demo-api-1",
          serviceName: "api",
        }),
      ];
    },
    projectRepository: createProjectRepository({
      projects: [
        {
          createdAt: new Date("2026-03-20T09:00:00.000Z"),
          id: "project_1",
          name: "Demo Project",
          slug: "demo-project",
          sourceType: "git",
          updatedAt: new Date("2026-03-20T09:00:00.000Z"),
        },
      ],
    }),
    readProjectRuntimeMetrics: async () => {
      return [
        {
          cpuPercent: 0,
          memoryLimitBytes: 0,
          memoryUsageBytes: 0,
          networkRxBytes: 0,
          networkTxBytes: 0,
          serviceName: "worker",
        },
        {
          cpuPercent: 1.25,
          memoryLimitBytes: 268435456,
          memoryUsageBytes: 73400320,
          networkRxBytes: 1024,
          networkTxBytes: 2048,
          serviceName: "api",
        },
      ] satisfies MetricsDto[];
    },
  });

  const result = await metricsService.listProjectMetrics({
    projectId: "project_1",
  });

  assert.deepEqual(result, [
    {
      cpuPercent: 1.25,
      memoryLimitBytes: 268435456,
      memoryUsageBytes: 73400320,
      networkRxBytes: 1024,
      networkTxBytes: 2048,
      serviceName: "api",
    },
    {
      cpuPercent: 0,
      memoryLimitBytes: 0,
      memoryUsageBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      serviceName: "worker",
    },
  ]);
});
