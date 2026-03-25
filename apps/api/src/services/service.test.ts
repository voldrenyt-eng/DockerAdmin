import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDto } from "@dockeradmin/shared";

import { AppError } from "../errors.js";
import { createProjectRepository } from "../projects/repository.js";
import { createServiceId } from "./identity.js";
import { createServiceService } from "./service.js";

const createServiceFixture = (
  overrides: Partial<ServiceDto> = {},
): ServiceDto => ({
  containerName: "demo-api-1",
  image: "nginx:1.27",
  ports: ["8080->80/tcp"],
  serviceName: "api",
  startedAt: "2026-03-19T15:20:00.000Z",
  status: "running",
  ...overrides,
});

test("createServiceService loads the project and lists runtime services by project slug", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-19T15:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-19T15:00:00.000Z"),
      },
    ],
  });
  const seenInputs: Array<{ projectSlug: string }> = [];
  const serviceService = createServiceService({
    listProjectRuntimeServices: async (input) => {
      seenInputs.push(input);

      return [createServiceFixture()];
    },
    projectRepository,
  });

  const result = await serviceService.listProjectServices({
    projectId: "project_1",
  });

  assert.deepEqual(seenInputs, [{ projectSlug: "demo-project" }]);
  assert.deepEqual(result, [
    createServiceFixture({
      serviceId: createServiceId({
        projectId: "project_1",
        serviceName: "api",
      }),
    }),
  ]);
});

test("createServiceService returns a standardized 404 when the project is missing", async () => {
  const serviceService = createServiceService({
    listProjectRuntimeServices: async () => {
      return [createServiceFixture()];
    },
    projectRepository: createProjectRepository(),
  });

  await assert.rejects(
    async () => {
      await serviceService.listProjectServices({
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

test("createServiceService resolves a verified action target by serviceId within the matching project runtime", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-19T15:00:00.000Z"),
        id: "project_1",
        name: "Project One",
        slug: "project-one",
        sourceType: "git",
        updatedAt: new Date("2026-03-19T15:00:00.000Z"),
      },
      {
        createdAt: new Date("2026-03-19T15:05:00.000Z"),
        id: "project_2",
        name: "Project Two",
        slug: "project-two",
        sourceType: "zip",
        updatedAt: new Date("2026-03-19T15:05:00.000Z"),
      },
    ],
  });
  const seenInputs: Array<{ projectSlug: string }> = [];
  const serviceService = createServiceService({
    listProjectRuntimeServices: async (input) => {
      seenInputs.push(input);

      return input.projectSlug === "project-one"
        ? [createServiceFixture({ serviceName: "api" })]
        : [createServiceFixture({ serviceName: "worker" })];
    },
    projectRepository,
  });

  const result = await serviceService.resolveServiceActionTarget({
    serviceId: createServiceId({
      projectId: "project_1",
      serviceName: "api",
    }),
  });

  assert.deepEqual(seenInputs, [{ projectSlug: "project-one" }]);
  assert.deepEqual(result, {
    projectId: "project_1",
    projectSlug: "project-one",
    serviceId: createServiceId({
      projectId: "project_1",
      serviceName: "api",
    }),
    serviceName: "api",
  });
});

test("createServiceService rejects a malformed serviceId during action target resolution", async () => {
  const serviceService = createServiceService({
    listProjectRuntimeServices: async () => {
      return [createServiceFixture()];
    },
    projectRepository: createProjectRepository(),
  });

  await assert.rejects(
    async () => {
      await serviceService.resolveServiceActionTarget({
        serviceId: "%%%not-valid%%%",
      });
    },
    (error: unknown) => {
      return (
        error instanceof AppError &&
        error.code === "NOT_FOUND" &&
        error.message === "Service not found"
      );
    },
  );
});

test("createServiceService rejects a serviceId whose service is absent from the project runtime", async () => {
  const serviceService = createServiceService({
    listProjectRuntimeServices: async () => {
      return [createServiceFixture({ serviceName: "worker" })];
    },
    projectRepository: createProjectRepository({
      projects: [
        {
          createdAt: new Date("2026-03-19T15:00:00.000Z"),
          id: "project_1",
          name: "Project One",
          slug: "project-one",
          sourceType: "git",
          updatedAt: new Date("2026-03-19T15:00:00.000Z"),
        },
      ],
    }),
  });

  await assert.rejects(
    async () => {
      await serviceService.resolveServiceActionTarget({
        serviceId: createServiceId({
          projectId: "project_1",
          serviceName: "api",
        }),
      });
    },
    (error: unknown) => {
      return (
        error instanceof AppError &&
        error.code === "NOT_FOUND" &&
        error.message === "Service not found"
      );
    },
  );
});

test("createServiceService performs a verified service action, returns the refreshed service, and writes a safe audit record", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T08:00:00.000Z"),
        id: "project_1",
        name: "Project One",
        slug: "project-one",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      },
    ],
  });
  const seenListInputs: Array<{ projectSlug: string }> = [];
  const actionCalls: Array<{
    action: "start" | "stop" | "restart";
    projectSlug: string;
    serviceName: string;
  }> = [];
  const auditRecords: Array<{
    action: string;
    entityId: string | null;
    entityType: string;
    message: string | null;
    projectId: string | null;
    userId: string | null;
  }> = [];
  let listCallCount = 0;
  const serviceId = createServiceId({
    projectId: "project_1",
    serviceName: "api",
  });
  const serviceService = createServiceService({
    auditLogRepository: {
      async createAuditLog(input) {
        auditRecords.push(input);
      },
    },
    listProjectRuntimeServices: async (input) => {
      seenListInputs.push(input);
      listCallCount += 1;

      return [
        createServiceFixture({
          startedAt: listCallCount === 1 ? "2026-03-20T08:01:00.000Z" : null,
          status: listCallCount === 1 ? "running" : "starting",
        }),
      ];
    },
    projectRepository,
    runProjectServiceAction: async (input) => {
      actionCalls.push(input);
    },
  });

  const result = await serviceService.performServiceAction({
    action: "restart",
    serviceId,
    userId: "user_admin",
  });

  assert.deepEqual(seenListInputs, [
    { projectSlug: "project-one" },
    { projectSlug: "project-one" },
  ]);
  assert.deepEqual(actionCalls, [
    {
      action: "restart",
      projectSlug: "project-one",
      serviceName: "api",
    },
  ]);
  assert.deepEqual(
    result,
    createServiceFixture({
      serviceId,
      startedAt: null,
      status: "starting",
    }),
  );
  assert.deepEqual(auditRecords, [
    {
      action: "SERVICE_ACTION",
      entityId: serviceId,
      entityType: "service",
      message: "Service restart completed successfully",
      projectId: "project_1",
      userId: "user_admin",
    },
  ]);
});

test("createServiceService writes a safe failed audit record when the docker action fails", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T08:00:00.000Z"),
        id: "project_1",
        name: "Project One",
        slug: "project-one",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      },
    ],
  });
  const auditRecords: Array<{
    action: string;
    entityId: string | null;
    entityType: string;
    message: string | null;
    projectId: string | null;
    userId: string | null;
  }> = [];
  const serviceId = createServiceId({
    projectId: "project_1",
    serviceName: "api",
  });
  const serviceService = createServiceService({
    auditLogRepository: {
      async createAuditLog(input) {
        auditRecords.push(input);
      },
    },
    listProjectRuntimeServices: async () => {
      return [createServiceFixture()];
    },
    projectRepository,
    runProjectServiceAction: async () => {
      throw new Error("docker compose restart leaked internals");
    },
  });

  await assert.rejects(
    async () => {
      await serviceService.performServiceAction({
        action: "restart",
        serviceId,
        userId: "user_admin",
      });
    },
    (error: unknown) => {
      return (
        error instanceof Error &&
        error.message === "Docker service action failed"
      );
    },
  );
  assert.deepEqual(auditRecords, [
    {
      action: "SERVICE_ACTION",
      entityId: serviceId,
      entityType: "service",
      message: "Service restart failed",
      projectId: "project_1",
      userId: "user_admin",
    },
  ]);
});
