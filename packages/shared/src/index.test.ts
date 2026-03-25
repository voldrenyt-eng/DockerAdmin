import assert from "node:assert/strict";
import test from "node:test";

import * as shared from "./index.js";
import {
  ApiErrorCodeSchema,
  ApiErrorSchema,
  ApiErrorStatusByCode,
  AuditActionSchema,
  AuditLogSchema,
  AuthLoginRequestSchema,
  AuthLogoutRequestSchema,
  AuthRefreshRequestSchema,
  AuthTokensSchema,
  DeploymentSchema,
  DomainSchema,
  MetricsSchema,
  ProjectEnvResponseSchema,
  ProjectEnvUpsertRequestSchema,
  ProjectSchema,
  ServiceSchema,
  parseApiError,
} from "./index.js";

const getSharedSchema = (
  exportName: string,
): {
  parse: (value: unknown) => unknown;
} => {
  const schema = (shared as Record<string, unknown>)[exportName];

  assert.ok(schema, `${exportName} must be exported`);
  assert.equal(typeof schema, "object");
  assert.equal(typeof (schema as { parse?: unknown }).parse, "function");

  return schema as { parse: (value: unknown) => unknown };
};

test("shared DTO package exports the required schema baseline", () => {
  const project = ProjectSchema.parse({
    id: "project_1",
    name: "DockerAdmin",
    slug: "dockeradmin",
    sourceType: "git",
  });

  const authTokens = AuthTokensSchema.parse({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });
  const authRefreshRequest = AuthRefreshRequestSchema.parse({
    refreshToken: "refresh-token",
  });
  const authLogoutRequest = AuthLogoutRequestSchema.parse({
    refreshToken: "refresh-token",
  });

  const domain = DomainSchema.parse({
    id: "domain_1",
    host: "dockeradmin.local",
    port: 3000,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: false,
  });

  const deployment = DeploymentSchema.parse({
    id: "deployment_1",
    status: "SUCCESS",
    startedAt: "2026-03-18T17:00:00.000Z",
    finishedAt: "2026-03-18T17:01:00.000Z",
    trigger: "manual",
    source: "git",
  });

  const service = ServiceSchema.parse({
    containerName: "dockeradmin-api-1",
    image: "dockeradmin-api:latest",
    ports: ["3001/tcp"],
    serviceName: "api",
    startedAt: "2026-03-18T17:00:00.000Z",
    status: "running",
  });

  const metrics = MetricsSchema.parse({
    cpuPercent: 1.25,
    memoryLimitBytes: 268435456,
    memoryUsageBytes: 73400320,
    networkRxBytes: 1024,
    networkTxBytes: 2048,
    serviceName: "api",
  });

  const apiError = ApiErrorSchema.parse({
    error: {
      code: "VALIDATION_ERROR",
      message: "Bad input",
    },
  });

  const authRequest = AuthLoginRequestSchema.parse({
    email: "admin@example.com",
    password: "strong-password",
  });

  assert.equal(project.slug, "dockeradmin");
  assert.equal(authTokens.accessToken, "access-token");
  assert.equal(authRefreshRequest.refreshToken, "refresh-token");
  assert.equal(authLogoutRequest.refreshToken, "refresh-token");
  assert.equal(domain.host, "dockeradmin.local");
  assert.equal(deployment.status, "SUCCESS");
  assert.equal(service.status, "running");
  assert.equal(metrics.serviceName, "api");
  assert.equal(apiError.error.code, "VALIDATION_ERROR");
  assert.equal(authRequest.email, "admin@example.com");
});

test("shared audit DTO package exports action and list contracts", () => {
  const auditLogListResponseSchema = getSharedSchema(
    "AuditLogListResponseSchema",
  );

  const action = AuditActionSchema.parse("PROJECT_CREATE");
  const auditLog = AuditLogSchema.parse({
    action: "ENV_UPDATE",
    createdAt: "2026-03-23T10:00:00.000Z",
    entityId: "env_1",
    entityType: "env",
    id: "audit_1",
    message: "Environment updated",
    projectId: "project_1",
    userId: "user_admin",
  });
  const response = auditLogListResponseSchema.parse({
    auditLogs: [auditLog],
    page: 2,
    pageSize: 25,
    total: 26,
    totalPages: 2,
  });

  assert.equal(action, "PROJECT_CREATE");
  assert.deepEqual(response, {
    auditLogs: [
      {
        action: "ENV_UPDATE",
        createdAt: "2026-03-23T10:00:00.000Z",
        entityId: "env_1",
        entityType: "env",
        id: "audit_1",
        message: "Environment updated",
        projectId: "project_1",
        userId: "user_admin",
      },
    ],
    page: 2,
    pageSize: 25,
    total: 26,
    totalPages: 2,
  });
  assert.throws(() => AuditActionSchema.parse("PROJECT_DELETE"));
  assert.throws(() =>
    auditLogListResponseSchema.parse({
      auditLogs: [
        {
          action: "AUTH_LOGIN",
          createdAt: "not-a-date",
          entityId: null,
          entityType: "auth",
          id: "audit_2",
          message: null,
          projectId: null,
          userId: "user_admin",
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    }),
  );
  assert.throws(() =>
    auditLogListResponseSchema.parse({
      auditLogs: [],
      page: 0,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    }),
  );
});

test("shared error contract exports canonical codes, statuses, and parser", () => {
  const code = ApiErrorCodeSchema.parse("NOT_FOUND");
  const parsedError = parseApiError({
    error: {
      code: "FORBIDDEN",
      message: "Access denied",
    },
  });
  const invalidError = parseApiError({
    message: "wrong shape",
  });

  assert.equal(code, "NOT_FOUND");
  assert.equal(ApiErrorStatusByCode.UNAUTHORIZED, 401);
  assert.equal(ApiErrorStatusByCode.FORBIDDEN, 403);
  assert.equal(ApiErrorStatusByCode.NOT_FOUND, 404);
  assert.equal(ApiErrorStatusByCode.CONFLICT, 409);
  assert.equal(ApiErrorStatusByCode.VALIDATION_ERROR, 422);
  assert.equal(ApiErrorStatusByCode.INTERNAL_ERROR, 500);
  assert.deepEqual(parsedError, {
    error: {
      code: "FORBIDDEN",
      message: "Access denied",
    },
  });
  assert.equal(invalidError, null);
});

test("shared project DTO package exports create, update, and list contracts", () => {
  const projectNameSchema = getSharedSchema("ProjectNameSchema");
  const projectSlugSchema = getSharedSchema("ProjectSlugSchema");
  const projectSourceTypeSchema = getSharedSchema("ProjectSourceTypeSchema");
  const projectCreateRequestSchema = getSharedSchema(
    "ProjectCreateRequestSchema",
  );
  const projectUpdateRequestSchema = getSharedSchema(
    "ProjectUpdateRequestSchema",
  );
  const projectListResponseSchema = getSharedSchema(
    "ProjectListResponseSchema",
  );

  const projectName = projectNameSchema.parse("  Demo Project  ");
  const projectSlug = projectSlugSchema.parse("demo-project-2");
  const projectSourceType = projectSourceTypeSchema.parse("git");
  const projectCreateRequest = projectCreateRequestSchema.parse({
    name: "  Demo Project  ",
    sourceType: "git",
  });
  const projectUpdateRequest = projectUpdateRequestSchema.parse({
    name: "  Renamed Project  ",
  });
  const projectListResponse = projectListResponseSchema.parse({
    projects: [
      {
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
      },
    ],
  });

  assert.equal(projectName, "Demo Project");
  assert.equal(projectSlug, "demo-project-2");
  assert.equal(projectSourceType, "git");
  assert.deepEqual(projectCreateRequest, {
    name: "Demo Project",
    sourceType: "git",
  });
  assert.deepEqual(projectUpdateRequest, {
    name: "Renamed Project",
  });
  assert.deepEqual(projectListResponse, {
    projects: [
      {
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
      },
    ],
  });
  assert.throws(() => projectNameSchema.parse("ab"));
  assert.throws(() => projectSlugSchema.parse("Demo Project"));
  assert.throws(() => projectSlugSchema.parse("-demo-project"));
  assert.throws(() => projectSourceTypeSchema.parse("manual"));
});

test("shared domain DTO package exports create and list contracts", () => {
  const domainCreateRequestSchema = getSharedSchema(
    "DomainCreateRequestSchema",
  );
  const domainListSchema = getSharedSchema("DomainListSchema");

  const createRequest = domainCreateRequestSchema.parse({
    host: "app.example.com",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
  });
  const listResponse = domainListSchema.parse([
    {
      host: "app.example.com",
      id: "domain_1",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: true,
    },
  ]);

  assert.deepEqual(createRequest, {
    host: "app.example.com",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
  });
  assert.deepEqual(listResponse, [
    {
      host: "app.example.com",
      id: "domain_1",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: true,
    },
  ]);
  assert.throws(() =>
    domainCreateRequestSchema.parse({
      host: "",
      port: 8080,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: false,
    }),
  );
  assert.deepEqual(
    domainCreateRequestSchema.parse({
      host: "  APP.EXAMPLE.COM  ",
      port: 65535,
      projectId: " project_1 ",
      serviceName: " api ",
      tlsEnabled: false,
    }),
    {
      host: "app.example.com",
      port: 65535,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: false,
    },
  );
  assert.throws(() =>
    domainCreateRequestSchema.parse({
      host: "localhost",
      port: 0,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: false,
    }),
  );
  assert.throws(() =>
    domainCreateRequestSchema.parse({
      host: "app.example.com",
      port: 65536,
      projectId: "project_1",
      serviceName: "api",
      tlsEnabled: false,
    }),
  );
});

test("shared git source request contract trims branch and allows only public https URLs", () => {
  const projectSourceGitRequestSchema = getSharedSchema(
    "ProjectSourceGitRequestSchema",
  );

  const request = projectSourceGitRequestSchema.parse({
    branch: "  main  ",
    url: "https://github.com/octocat/Hello-World.git",
  });

  assert.deepEqual(request, {
    branch: "main",
    url: "https://github.com/octocat/Hello-World.git",
  });
  assert.throws(() =>
    projectSourceGitRequestSchema.parse({
      url: "http://github.com/octocat/Hello-World.git",
    }),
  );
  assert.throws(() =>
    projectSourceGitRequestSchema.parse({
      url: "https://user:pass@github.com/octocat/Hello-World.git",
    }),
  );
});

test("shared deployment DTO package exports the deployment history list contract", () => {
  const deploymentListSchema = getSharedSchema("DeploymentListSchema");

  const deployments = deploymentListSchema.parse([
    {
      finishedAt: "2026-03-19T12:06:00.000Z",
      id: "deployment_2",
      source: "git",
      startedAt: "2026-03-19T12:05:00.000Z",
      status: "FAILED",
      trigger: "manual",
    },
    {
      finishedAt: "2026-03-19T12:01:00.000Z",
      id: "deployment_1",
      source: "zip",
      startedAt: "2026-03-19T12:00:00.000Z",
      status: "SUCCESS",
      trigger: "manual",
    },
  ]);

  assert.equal(Array.isArray(deployments), true);
  assert.equal(deployments.length, 2);
});

test("shared DTO package exports the metrics list contract", () => {
  const metricsListSchema = getSharedSchema("MetricsListSchema");
  const metricsList = metricsListSchema.parse([
    {
      cpuPercent: 1.25,
      memoryLimitBytes: 268435456,
      memoryUsageBytes: 73400320,
      networkRxBytes: 1024,
      networkTxBytes: 2048,
      serviceName: "api",
    },
  ]);

  assert.deepEqual(metricsList, [
    {
      cpuPercent: 1.25,
      memoryLimitBytes: 268435456,
      memoryUsageBytes: 73400320,
      networkRxBytes: 1024,
      networkTxBytes: 2048,
      serviceName: "api",
    },
  ]);
});

test("shared env contract preserves raw content for admin save/read flows", () => {
  const request = ProjectEnvUpsertRequestSchema.parse({
    content: "# comment\nDATABASE_URL=postgres://user:pass@db/app\nEMPTY=\n",
  });
  const response = ProjectEnvResponseSchema.parse({
    content: "# comment\nDATABASE_URL=postgres://user:pass@db/app\nEMPTY=\n",
  });

  assert.deepEqual(request, {
    content: "# comment\nDATABASE_URL=postgres://user:pass@db/app\nEMPTY=\n",
  });
  assert.deepEqual(response, {
    content: "# comment\nDATABASE_URL=postgres://user:pass@db/app\nEMPTY=\n",
  });
  assert.throws(() => ProjectEnvUpsertRequestSchema.parse({}));
  assert.throws(() => ProjectEnvResponseSchema.parse({}));
});
