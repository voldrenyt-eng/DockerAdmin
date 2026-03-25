import {
  AuditActionSchema,
  AuditLogListResponseSchema,
  AuthLoginRequestSchema,
  AuthLogoutRequestSchema,
  AuthRefreshRequestSchema,
  AuthSchema,
  AuthUserSchema,
  DeploymentListSchema,
  DeploymentSchema,
  DomainCreateRequestSchema,
  DomainListSchema,
  DomainSchema,
  MetricsListSchema,
  ProjectCreateRequestSchema,
  ProjectEnvResponseSchema,
  ProjectEnvUpsertRequestSchema,
  ProjectListResponseSchema,
  ProjectLogsResponseSchema,
  ProjectSchema,
  ProjectSourceGitRequestSchema,
  ProjectUpdateRequestSchema,
  ServiceActionRequestSchema,
  ServiceSchema,
} from "@dockeradmin/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditService } from "./audit/service.js";
import { createAdminGuard } from "./auth/guard.js";
import type { AuthService } from "./auth/service.js";
import type { DeployService } from "./deploy/service.js";
import type { DomainService } from "./domains/service.js";
import type { EnvService } from "./env/service.js";
import {
  VALIDATION_ERROR_MESSAGE,
  appErrors,
  toApiErrorResponse,
} from "./errors.js";
import type { LogsService } from "./logs/service.js";
import type { LogsStreamService } from "./logs/service.js";
import { registerLogsWebSocket } from "./logs/ws.js";
import type { MetricsService } from "./metrics/service.js";
import type { ProjectService } from "./projects/service.js";
import {
  DEFAULT_WEB_ORIGIN,
  applyCorsHeaders,
  applyCorsPreflightHeaders,
  applySecurityHeaders,
  resolveAllowedCorsOrigin,
} from "./security.js";
import type { ServiceService } from "./services/service.js";
import {
  type SourceService,
  ZIP_UPLOAD_SIZE_MESSAGE,
} from "./source/service.js";

export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 1024 * 1024;
export const REQUEST_BODY_TOO_LARGE_MESSAGE =
  "Request body exceeds the maximum allowed size";
const ZIP_SOURCE_ROUTE_URL = "/api/projects/:id/source/zip";

type BuildAppOptions = {
  auditService?: AuditService;
  authService?: AuthService;
  deployService?: DeployService;
  domainService?: DomainService;
  envService?: EnvService;
  logsService?: LogsService;
  logsStreamService?: LogsStreamService;
  metricsService?: MetricsService;
  projectService?: ProjectService;
  serviceService?: ServiceService;
  sourceService?: SourceService;
  webOrigin?: string;
};

export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({
    bodyLimit: DEFAULT_REQUEST_BODY_LIMIT_BYTES,
    logger: true,
  });
  const auditService = options.auditService;
  const authService = options.authService;
  const deployService = options.deployService;
  const domainService = options.domainService;
  const envService = options.envService;
  const logsService = options.logsService;
  const logsStreamService = options.logsStreamService;
  const metricsService = options.metricsService;
  const projectService = options.projectService;
  const serviceService = options.serviceService;
  const sourceService = options.sourceService;
  const webOrigin = options.webOrigin ?? DEFAULT_WEB_ORIGIN;
  const requireAdminAuth = authService
    ? createAdminGuard(authService)
    : async (): Promise<void> => {
        throw new Error("Auth service is not configured");
      };
  const ProjectParamsSchema = z.object({
    id: z.string().min(1),
  });
  const DomainParamsSchema = z.object({
    id: z.string().min(1),
  });
  const ProjectLogsQuerySchema = z.object({
    serviceName: z.string().min(1),
    tail: z.coerce.number().int().positive().max(1000).default(200),
  });
  const AuditQuerySchema = z.object({
    action: z.union([AuditActionSchema, z.literal("")]).default(""),
    entityType: z.string().trim().default(""),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    q: z.string().trim().default(""),
  });
  const AuditExportQuerySchema = z.object({
    action: z.union([AuditActionSchema, z.literal("")]).default(""),
    entityType: z.string().trim().default(""),
    q: z.string().trim().default(""),
  });
  const MetricsQuerySchema = z.object({
    projectId: z.string().min(1),
  });
  const ServiceParamsSchema = z.object({
    serviceId: z.string().min(1),
  });
  const healthPayload = {
    service: "api" as const,
    status: "ok" as const,
  };

  app.addContentTypeParser(
    ["application/octet-stream", "application/zip"],
    {
      parseAs: "buffer",
    },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  app.addHook("onRequest", async (request, reply) => {
    const isCorsPreflight =
      request.method === "OPTIONS" &&
      typeof request.headers["access-control-request-method"] === "string";

    if (!isCorsPreflight) {
      return;
    }

    const allowedOrigin = resolveAllowedCorsOrigin({
      originHeader: request.headers.origin,
      webOrigin,
    });

    if (!allowedOrigin) {
      throw appErrors.forbidden("CORS origin is not allowed");
    }

    applyCorsPreflightHeaders({
      allowedOrigin,
      reply,
      requestHeaders: request.headers["access-control-request-headers"],
    });

    return reply.status(204).send();
  });

  app.addHook("onSend", async (request, reply, payload) => {
    applySecurityHeaders(reply);

    const allowedOrigin = resolveAllowedCorsOrigin({
      originHeader: request.headers.origin,
      webOrigin,
    });

    if (allowedOrigin) {
      applyCorsHeaders({
        allowedOrigin,
        reply,
      });
    }

    return payload;
  });

  app.setNotFoundHandler((_request, reply) => {
    const { payload, statusCode } = toApiErrorResponse(appErrors.notFound());

    return reply.status(statusCode).send(payload);
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "FST_ERR_CTP_BODY_TOO_LARGE"
    ) {
      const validationMessage =
        request.routeOptions.url === ZIP_SOURCE_ROUTE_URL
          ? ZIP_UPLOAD_SIZE_MESSAGE
          : REQUEST_BODY_TOO_LARGE_MESSAGE;
      const { payload, statusCode } = toApiErrorResponse(
        appErrors.validation(validationMessage),
      );

      return reply.status(statusCode).send(payload);
    }

    const { payload, statusCode } = toApiErrorResponse(error);

    if (statusCode === 500) {
      request.log.error(error);
    }

    return reply.status(statusCode).send(payload);
  });

  app.get("/health", async () => {
    return healthPayload;
  });

  app.get("/api/health", async () => {
    return healthPayload;
  });

  app.get("/api/contracts/project", async (_request, reply) => {
    const payload = ProjectSchema.parse({
      id: "project_1",
      name: "DockerAdmin",
      slug: "dockeradmin",
      sourceType: "git",
    });

    return reply.send(payload);
  });

  app.post("/api/contracts/auth/login", async (request, reply) => {
    const parsed = AuthLoginRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
    }

    const payload = AuthSchema.parse({
      tokens: {
        accessToken: "demo-access-token",
        refreshToken: "demo-refresh-token",
      },
      user: {
        email: parsed.data.email,
        id: "user_1",
        role: "ADMIN",
      },
    });

    return reply.send(payload);
  });

  app.get("/api/contracts/error/unauthorized", async () => {
    throw appErrors.unauthorized();
  });

  app.get("/api/contracts/error/forbidden", async () => {
    throw appErrors.forbidden();
  });

  app.get("/api/contracts/error/conflict", async () => {
    throw appErrors.conflict();
  });

  app.get("/api/contracts/error/internal", async () => {
    throw new Error("Synthetic internal error");
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = AuthLoginRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
    }

    if (!authService) {
      throw new Error("Auth service is not configured");
    }

    const payload = await authService.login(parsed.data);

    return reply.send(AuthSchema.parse(payload));
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const parsed = AuthRefreshRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
    }

    if (!authService) {
      throw new Error("Auth service is not configured");
    }

    const payload = await authService.refresh(parsed.data);

    return reply.send(AuthSchema.parse(payload));
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const parsed = AuthLogoutRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
    }

    if (!authService) {
      throw new Error("Auth service is not configured");
    }

    await authService.logout(parsed.data);

    return reply.status(204).send();
  });

  app.get(
    "/api/me",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      return reply.send(AuthUserSchema.parse(request.currentUser));
    },
  );

  app.get(
    "/api/audit",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedQuery = AuditQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!auditService) {
        throw new Error("Audit service is not configured");
      }

      const auditLogs = await auditService.listAuditLogs(parsedQuery.data);

      return reply.send(AuditLogListResponseSchema.parse(auditLogs));
    },
  );

  app.get(
    "/api/audit/export",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedQuery = AuditExportQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!auditService) {
        throw new Error("Audit service is not configured");
      }

      const csv = await auditService.exportAuditLogsCsv(parsedQuery.data);
      const filenameDate = new Date().toISOString().slice(0, 10);

      reply.header(
        "content-disposition",
        `attachment; filename="audit-export-${filenameDate}.csv"`,
      );
      reply.type("text/csv; charset=utf-8");

      return reply.send(csv);
    },
  );

  app.post(
    "/api/projects",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsed = ProjectCreateRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!projectService) {
        throw new Error("Project service is not configured");
      }

      const payload = await projectService.createProject({
        ...parsed.data,
        userId: request.currentUser?.id ?? null,
      });

      return reply.status(201).send(ProjectSchema.parse(payload));
    },
  );

  app.get(
    "/api/projects",
    { preHandler: requireAdminAuth },
    async (_request, reply) => {
      if (!projectService) {
        throw new Error("Project service is not configured");
      }

      const projects = await projectService.listProjects();

      return reply.send(
        ProjectListResponseSchema.parse({
          projects,
        }),
      );
    },
  );

  app.post(
    "/api/domains",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsed = DomainCreateRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!domainService) {
        throw new Error("Domain service is not configured");
      }

      const payload = await domainService.createDomain({
        ...parsed.data,
        userId: request.currentUser?.id ?? null,
      });

      return reply.status(201).send(DomainSchema.parse(payload));
    },
  );

  app.get(
    "/api/domains",
    { preHandler: requireAdminAuth },
    async (_request, reply) => {
      if (!domainService) {
        throw new Error("Domain service is not configured");
      }

      const payload = await domainService.listDomains();

      return reply.send(DomainListSchema.parse(payload));
    },
  );

  app.delete(
    "/api/domains/:id",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = DomainParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!domainService) {
        throw new Error("Domain service is not configured");
      }

      await domainService.deleteDomain(
        parsedParams.data.id,
        request.currentUser?.id ?? null,
      );

      return reply.status(204).send();
    },
  );

  app.get(
    "/api/projects/:id",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!projectService) {
        throw new Error("Project service is not configured");
      }

      const payload = await projectService.getProjectById(parsedParams.data.id);

      return reply.send(ProjectSchema.parse(payload));
    },
  );

  app.patch(
    "/api/projects/:id",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);
      const parsedBody = ProjectUpdateRequestSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!projectService) {
        throw new Error("Project service is not configured");
      }

      const payload = await projectService.updateProjectName({
        id: parsedParams.data.id,
        name: parsedBody.data.name,
        userId: request.currentUser?.id ?? null,
      });

      return reply.send(ProjectSchema.parse(payload));
    },
  );

  app.put(
    "/api/projects/:id/env",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);
      const parsedBody = ProjectEnvUpsertRequestSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!envService) {
        throw new Error("Env service is not configured");
      }

      await envService.putProjectEnv({
        ...parsedBody.data,
        projectId: parsedParams.data.id,
        userId: request.currentUser?.id ?? null,
      });

      return reply.status(204).send();
    },
  );

  app.get(
    "/api/projects/:id/deployments",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!deployService) {
        throw new Error("Deploy service is not configured");
      }

      const payload = await deployService.listProjectDeployments({
        projectId: parsedParams.data.id,
      });

      return reply.send(DeploymentListSchema.parse(payload));
    },
  );

  app.get(
    "/api/metrics",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedQuery = MetricsQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!metricsService) {
        throw new Error("Metrics service is not configured");
      }

      const payload = await metricsService.listProjectMetrics(parsedQuery.data);

      return reply.send(MetricsListSchema.parse(payload));
    },
  );

  app.get(
    "/api/projects/:id/services",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!serviceService) {
        throw new Error("Service service is not configured");
      }

      const payload = await serviceService.listProjectServices({
        projectId: parsedParams.data.id,
      });

      return reply.send(z.array(ServiceSchema).parse(payload));
    },
  );

  app.post(
    "/api/services/:serviceId/action",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ServiceParamsSchema.safeParse(request.params);
      const parsedBody = ServiceActionRequestSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!serviceService) {
        throw new Error("Service service is not configured");
      }

      const payload = await serviceService.performServiceAction({
        action: parsedBody.data.action,
        serviceId: parsedParams.data.serviceId,
        userId: request.currentUser?.id ?? null,
      });

      return reply.send(ServiceSchema.parse(payload));
    },
  );

  app.get(
    "/api/projects/:id/logs",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);
      const parsedQuery = ProjectLogsQuerySchema.safeParse(request.query);

      if (!parsedParams.success || !parsedQuery.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!logsService) {
        throw new Error("Logs service is not configured");
      }

      const payload = await logsService.getProjectLogs({
        projectId: parsedParams.data.id,
        serviceName: parsedQuery.data.serviceName,
        tail: parsedQuery.data.tail,
      });

      return reply.send(ProjectLogsResponseSchema.parse(payload));
    },
  );

  app.get(
    "/api/projects/:id/env",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!envService) {
        throw new Error("Env service is not configured");
      }

      const payload = await envService.getProjectEnv({
        projectId: parsedParams.data.id,
      });

      return reply.send(ProjectEnvResponseSchema.parse(payload));
    },
  );

  app.post(
    "/api/projects/:id/deploy",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!deployService) {
        throw new Error("Deploy service is not configured");
      }

      const payload = await deployService.deployProject({
        projectId: parsedParams.data.id,
        userId: request.currentUser?.id ?? null,
      });

      return reply.send(DeploymentSchema.parse(payload));
    },
  );

  app.post(
    "/api/projects/:id/source/zip",
    sourceService
      ? {
          bodyLimit: sourceService.maxUploadBytes,
          preHandler: requireAdminAuth,
        }
      : {
          preHandler: requireAdminAuth,
        },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!sourceService) {
        throw new Error("Source service is not configured");
      }

      if (!Buffer.isBuffer(request.body)) {
        throw appErrors.validation("ZIP archive is required");
      }

      await sourceService.uploadZipSource({
        archive: request.body,
        projectId: parsedParams.data.id,
        userId: request.currentUser?.id ?? null,
      });

      return reply.status(204).send();
    },
  );

  app.post(
    "/api/projects/:id/source/git",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const parsedParams = ProjectParamsSchema.safeParse(request.params);
      const parsedBody = ProjectSourceGitRequestSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        throw appErrors.validation(VALIDATION_ERROR_MESSAGE);
      }

      if (!sourceService) {
        throw new Error("Source service is not configured");
      }

      await sourceService.cloneGitSource({
        ...parsedBody.data,
        projectId: parsedParams.data.id,
        userId: request.currentUser?.id ?? null,
      });

      return reply.status(204).send();
    },
  );

  registerLogsWebSocket({
    app,
    authService,
    logsStreamService,
  });

  return app;
};
