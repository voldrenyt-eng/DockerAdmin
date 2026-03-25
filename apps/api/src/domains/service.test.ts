import assert from "node:assert/strict";
import test from "node:test";

import type { DomainCreateRequestDto, ServiceDto } from "@dockeradmin/shared";

import { createAuditLogCapture } from "../audit/test-utils.js";
import { appErrors } from "../errors.js";
import { createProjectRepository } from "../projects/repository.js";
import { createDomainRepository } from "./repository.js";
import { createDomainService } from "./service.js";

const createRuntimeService = (serviceName: string): ServiceDto => ({
  containerName: `demo-${serviceName}-1`,
  image: "nginx:1.27",
  ports: ["80/tcp"],
  serviceId: `${serviceName}-id`,
  serviceName,
  startedAt: "2026-03-20T12:00:00.000Z",
  status: "running",
});

test("createDomain stores a new binding for an existing project", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const runtimeLookupCalls: string[] = [];
  let syncCalls = 0;
  const domainService = createDomainService({
    domainRepository: createDomainRepository(),
    listProjectRuntimeServices: async ({
      projectSlug,
    }: {
      projectSlug: string;
    }) => {
      runtimeLookupCalls.push(projectSlug);

      return [createRuntimeService("api")];
    },
    projectRepository,
    syncTraefikRoutes: async () => {
      syncCalls += 1;
    },
  } as never);

  const created = await domainService.createDomain({
    host: "app.example.com",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
  } satisfies DomainCreateRequestDto);

  assert.deepEqual(created, {
    host: "app.example.com",
    id: "domain_1",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
  });
  assert.deepEqual(runtimeLookupCalls, ["demo-project"]);
  assert.equal(syncCalls, 1);
});

test("createDomain returns a standardized 404 when the project is missing", async () => {
  const domainService = createDomainService({
    domainRepository: createDomainRepository(),
    listProjectRuntimeServices: async () => [],
    projectRepository: createProjectRepository(),
  });

  await assert.rejects(
    () =>
      domainService.createDomain({
        host: "app.example.com",
        port: 8080,
        projectId: "project_missing",
        serviceName: "api",
        tlsEnabled: false,
      }),
    appErrors.notFound("Project not found"),
  );
});

test("createDomain returns a standardized 409 when the host already exists", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const domainService = createDomainService({
    domainRepository: createDomainRepository({
      domains: [
        {
          createdAt: new Date("2026-03-20T12:00:00.000Z"),
          host: "app.example.com",
          id: "domain_1",
          port: 8080,
          projectId: "project_1",
          serviceName: "api",
          tlsEnabled: true,
          updatedAt: new Date("2026-03-20T12:00:00.000Z"),
        },
      ],
    }),
    listProjectRuntimeServices: async () => [createRuntimeService("api")],
    projectRepository,
  });

  await assert.rejects(
    () =>
      domainService.createDomain({
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: false,
      }),
    appErrors.conflict("Domain host already exists"),
  );
});

test("createDomain returns a standardized 404 when the target service is absent from the runtime", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const domainService = createDomainService({
    domainRepository: createDomainRepository(),
    listProjectRuntimeServices: async () => [createRuntimeService("web")],
    projectRepository,
  });

  await assert.rejects(
    () =>
      domainService.createDomain({
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      }),
    appErrors.notFound("Service not found"),
  );
});

test("listDomains returns existing bindings and deleteDomain removes one binding", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const domainRepository = createDomainRepository({
    domains: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        host: "app.example.com",
        id: "domain_1",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
      {
        createdAt: new Date("2026-03-20T12:05:00.000Z"),
        host: "admin.example.com",
        id: "domain_2",
        port: 3001,
        projectId: "project_1",
        serviceName: "web",
        tlsEnabled: false,
        updatedAt: new Date("2026-03-20T12:05:00.000Z"),
      },
    ],
  });
  let syncCalls = 0;
  const domainService = createDomainService({
    domainRepository,
    listProjectRuntimeServices: async () => [],
    projectRepository,
    syncTraefikRoutes: async () => {
      syncCalls += 1;
    },
  } as never);

  assert.deepEqual(await domainService.listDomains(), [
    {
      host: "app.example.com",
      id: "domain_1",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: true,
    },
    {
      host: "admin.example.com",
      id: "domain_2",
      port: 3001,
      projectId: "project_1",
      serviceName: "web",
      tlsEnabled: false,
    },
  ]);

  await domainService.deleteDomain("domain_1");
  assert.equal(syncCalls, 1);

  assert.deepEqual(await domainService.listDomains(), [
    {
      host: "admin.example.com",
      id: "domain_2",
      port: 3001,
      projectId: "project_1",
      serviceName: "web",
      tlsEnabled: false,
    },
  ]);
});

test("deleteDomain returns a standardized 404 when the binding is missing", async () => {
  const domainService = createDomainService({
    domainRepository: createDomainRepository(),
    listProjectRuntimeServices: async () => [],
    projectRepository: createProjectRepository(),
  });

  await assert.rejects(
    () => domainService.deleteDomain("domain_missing"),
    appErrors.notFound("Domain not found"),
  );
});

test("createDomain surfaces a routes sync failure after persistence", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const domainRepository = createDomainRepository();
  const domainService = createDomainService({
    domainRepository,
    listProjectRuntimeServices: async () => [createRuntimeService("api")],
    projectRepository,
    syncTraefikRoutes: async () => {
      throw new Error("Traefik routes sync failed");
    },
  } as never);

  await assert.rejects(
    () =>
      domainService.createDomain({
        host: "app.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      }),
    /Traefik routes sync failed/,
  );

  assert.deepEqual(await domainService.listDomains(), [
    {
      host: "app.example.com",
      id: "domain_1",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: true,
    },
  ]);
});

test("createDomain and deleteDomain write safe DOMAIN_UPSERT audit records", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
  });
  const auditLogCapture = createAuditLogCapture();
  const domainService = createDomainService({
    auditLogRepository: auditLogCapture.auditLogRepository,
    domainRepository: createDomainRepository(),
    listProjectRuntimeServices: async () => [createRuntimeService("api")],
    projectRepository,
    syncTraefikRoutes: async () => {},
  } as never);

  const created = await domainService.createDomain({
    host: "app.example.com",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
    userId: "user_admin",
  } as DomainCreateRequestDto & { userId: string });

  await domainService.deleteDomain(created.id, "user_admin");

  assert.deepEqual(auditLogCapture.listAuditLogs(), [
    {
      action: "DOMAIN_UPSERT",
      entityId: created.id,
      entityType: "domain",
      message: "Domain binding created",
      projectId: "project_1",
      userId: "user_admin",
    },
    {
      action: "DOMAIN_UPSERT",
      entityId: created.id,
      entityType: "domain",
      message: "Domain binding deleted",
      projectId: "project_1",
      userId: "user_admin",
    },
  ]);
});
