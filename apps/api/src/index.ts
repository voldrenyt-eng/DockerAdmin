import { PrismaClient } from "@prisma/client";
import { createPrismaAuditLogRepository } from "./audit/repository.js";
import { createAuditService } from "./audit/service.js";
import { createPrismaAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { loadApiConfig } from "./config.js";
import { createDeployPreflightService } from "./deploy/preflight.js";
import { createPrismaDeploymentRepository } from "./deploy/repository.js";
import { createDeployService } from "./deploy/service.js";
import { createPrismaDomainRepository } from "./domains/repository.js";
import { createTraefikRoutesSyncer } from "./domains/routes.js";
import { createDomainService } from "./domains/service.js";
import { createEnvService } from "./env/service.js";
import { createLogsService, createLogsStreamService } from "./logs/service.js";
import { createMetricsService } from "./metrics/service.js";
import { createTelegramNotifierService } from "./notifier/service.js";
import { createPrismaProjectRepository } from "./projects/repository.js";
import { createProjectService } from "./projects/service.js";
import { createRuntimePaths } from "./runtime/paths.js";
import { buildApp } from "./server.js";
import { createServiceService } from "./services/service.js";
import { createSourceService } from "./source/service.js";

const config = loadApiConfig();
const prisma = new PrismaClient();
const projectRepository = createPrismaProjectRepository(prisma);
const deploymentRepository = createPrismaDeploymentRepository(prisma);
const domainRepository = createPrismaDomainRepository(prisma);
const auditLogRepository = createPrismaAuditLogRepository(prisma);
const auditService = createAuditService({
  auditLogRepository,
});
const runtimePaths = createRuntimePaths({
  dataRoot: config.dataRoot,
});
const authService = createAuthService({
  auditLogRepository,
  authRepository: createPrismaAuthRepository(prisma),
  jwtAccessSecret: config.jwtAccessSecret,
  jwtRefreshSecret: config.jwtRefreshSecret,
});
const projectService = createProjectService({
  auditLogRepository,
  projectRepository,
  runtimePaths,
});
const envService = createEnvService({
  auditLogRepository,
  envEncryptionKey: config.envEncryptionKey,
  projectRepository,
  runtimePaths,
});
const domainService = createDomainService({
  auditLogRepository,
  domainRepository,
  projectRepository,
  syncTraefikRoutes: createTraefikRoutesSyncer({
    domainRepository,
  }),
});
const logsService = createLogsService({
  projectRepository,
});
const logsStreamService = createLogsStreamService({
  projectRepository,
});
const metricsService = createMetricsService({
  projectRepository,
});
const telegramNotifierService = createTelegramNotifierService({
  ...(config.telegramBotToken
    ? { botToken: config.telegramBotToken }
    : undefined),
  ...(config.telegramChatId ? { chatId: config.telegramChatId } : undefined),
});
const deployPreflightService = createDeployPreflightService({
  envEncryptionKey: config.envEncryptionKey,
  projectRepository,
  runtimePaths,
});
const deployService = createDeployService({
  auditLogRepository,
  deploymentRepository,
  deployTimeoutMs: config.deployTimeoutMs,
  envEncryptionKey: config.envEncryptionKey,
  preflightService: deployPreflightService,
  projectRepository,
  telegramNotifierService,
  runtimePaths,
});
const sourceService = createSourceService({
  auditLogRepository,
  projectRepository,
  runtimePaths,
});
const serviceService = createServiceService({
  auditLogRepository,
  projectRepository,
});
const app = buildApp({
  auditService,
  authService,
  deployService,
  domainService,
  envService,
  logsService,
  logsStreamService,
  metricsService,
  projectService,
  serviceService,
  sourceService,
  webOrigin: config.webOrigin,
});

const start = async (): Promise<void> => {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});
