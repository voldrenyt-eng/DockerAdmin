import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
]);

export const ApiErrorStatusByCode = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
} as const;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
  }),
});

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthLogoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const AuthUserSchema = z.object({
  email: z.string().email(),
  id: z.string().min(1),
  role: z.literal("ADMIN"),
});

export const AuthSchema = z.object({
  tokens: AuthTokensSchema,
  user: AuthUserSchema,
});
export const AuditActionSchema = z.enum([
  "AUTH_LOGIN",
  "AUTH_LOGOUT",
  "AUTH_REFRESH",
  "PROJECT_CREATE",
  "PROJECT_UPDATE",
  "SOURCE_UPLOAD",
  "SOURCE_CLONE",
  "ENV_UPDATE",
  "DEPLOY_START",
  "DEPLOY_FINISH",
  "DOMAIN_UPSERT",
  "SERVICE_ACTION",
]);
export const AuditLogSchema = z.object({
  action: AuditActionSchema,
  createdAt: z.string().datetime(),
  entityId: z.string().min(1).nullable(),
  entityType: z.string().min(1),
  id: z.string().min(1),
  message: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable(),
  userId: z.string().min(1).nullable(),
});
export const AuditLogListResponseSchema = z.object({
  auditLogs: z.array(AuditLogSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const isPublicHttpsGitUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
};

const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const isValidFqdn = (value: string): boolean => {
  if (value.length > 253) {
    return false;
  }

  const labels = value.split(".");

  if (labels.length < 2) {
    return false;
  }

  const topLevelLabel = labels[labels.length - 1] ?? "";

  return (
    /[a-z]/.test(topLevelLabel) &&
    labels.every((label) => {
      return (
        label.length > 0 && label.length <= 63 && domainLabelPattern.test(label)
      );
    })
  );
};

export const ProjectSourceTypeSchema = z.enum(["zip", "git"]);
export const ProjectNameSchema = z.string().trim().min(3).max(80);
export const ProjectSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);
export const ProjectEnvContentSchema = z.string();
export const ProjectSourceGitUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPublicHttpsGitUrl);
export const ProjectSourceGitBranchSchema = z.string().trim().min(1).max(255);
export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: ProjectNameSchema,
  slug: ProjectSlugSchema,
  sourceType: ProjectSourceTypeSchema,
});
export const ProjectCreateRequestSchema = z.object({
  name: ProjectNameSchema,
  sourceType: ProjectSourceTypeSchema,
});
export const ProjectUpdateRequestSchema = z.object({
  name: ProjectNameSchema,
});
export const ProjectEnvUpsertRequestSchema = z.object({
  content: ProjectEnvContentSchema,
});
export const ProjectEnvResponseSchema = z.object({
  content: ProjectEnvContentSchema,
});
export const ProjectLogsResponseSchema = z.object({
  lines: z.array(z.string()),
  serviceName: z.string().min(1),
  tail: z.number().int().positive(),
});
export const ProjectLogsStreamSnapshotSchema = z.object({
  lines: z.array(z.string()),
  serviceName: z.string().min(1),
  tail: z.number().int().positive(),
  type: z.literal("snapshot"),
});
export const ProjectLogsStreamLineSchema = z.object({
  line: z.string(),
  serviceName: z.string().min(1),
  type: z.literal("line"),
});
export const ProjectLogsStreamErrorSchema = z.object({
  message: z.string().min(1),
  type: z.literal("error"),
});
export const ProjectLogsStreamMessageSchema = z.union([
  ProjectLogsStreamSnapshotSchema,
  ProjectLogsStreamLineSchema,
  ProjectLogsStreamErrorSchema,
]);
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});
export const ProjectSourceGitRequestSchema = z.object({
  branch: ProjectSourceGitBranchSchema.optional(),
  url: ProjectSourceGitUrlSchema,
});

export const DeploymentSchema = z.object({
  finishedAt: z.string().datetime().nullable(),
  id: z.string().min(1),
  source: z.enum(["zip", "git", "manual"]),
  startedAt: z.string().datetime(),
  status: z.enum(["RUNNING", "SUCCESS", "FAILED"]),
  trigger: z.enum(["manual", "system"]),
});
export const DeploymentListSchema = z.array(DeploymentSchema);

const DomainHostSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase())
  .refine(isValidFqdn);
const DomainPortSchema = z.number().int().min(1).max(65535);
const DomainProjectIdSchema = z.string().trim().min(1);
const DomainServiceNameSchema = z.string().trim().min(1);

export const DomainSchema = z.object({
  host: DomainHostSchema,
  id: z.string().min(1),
  port: DomainPortSchema,
  projectId: DomainProjectIdSchema,
  serviceName: DomainServiceNameSchema,
  tlsEnabled: z.boolean(),
});
export const DomainCreateRequestSchema = z.object({
  host: DomainHostSchema,
  port: DomainPortSchema,
  projectId: DomainProjectIdSchema,
  serviceName: DomainServiceNameSchema,
  tlsEnabled: z.boolean(),
});
export const DomainListSchema = z.array(DomainSchema);

export const ServiceSchema = z.object({
  containerName: z.string().min(1),
  image: z.string().min(1),
  ports: z.array(z.string().min(1)),
  serviceId: z.string().min(1).optional(),
  serviceName: z.string().min(1),
  startedAt: z.string().datetime().nullable(),
  status: z.enum(["running", "stopped", "starting", "unknown"]),
});
export const ServiceActionSchema = z.enum(["start", "stop", "restart"]);
export const ServiceActionRequestSchema = z.object({
  action: ServiceActionSchema,
});

export const MetricsSchema = z.object({
  cpuPercent: z.number().nonnegative(),
  memoryLimitBytes: z.number().nonnegative(),
  memoryUsageBytes: z.number().nonnegative(),
  networkRxBytes: z.number().nonnegative(),
  networkTxBytes: z.number().nonnegative(),
  serviceName: z.string().min(1),
});
export const MetricsListSchema = z.array(MetricsSchema);

export const parseApiError = (value: unknown) => {
  const parsed = ApiErrorSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
};

export type ApiErrorCodeDto = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;
export type AuditActionDto = z.infer<typeof AuditActionSchema>;
export type AuditLogDto = z.infer<typeof AuditLogSchema>;
export type AuditLogListResponseDto = z.infer<
  typeof AuditLogListResponseSchema
>;
export type AuthDto = z.infer<typeof AuthSchema>;
export type AuthLoginRequestDto = z.infer<typeof AuthLoginRequestSchema>;
export type AuthLogoutRequestDto = z.infer<typeof AuthLogoutRequestSchema>;
export type AuthRefreshRequestDto = z.infer<typeof AuthRefreshRequestSchema>;
export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;
export type AuthUserDto = z.infer<typeof AuthUserSchema>;
export type DeploymentDto = z.infer<typeof DeploymentSchema>;
export type DeploymentListDto = z.infer<typeof DeploymentListSchema>;
export type DomainDto = z.infer<typeof DomainSchema>;
export type DomainCreateRequestDto = z.infer<typeof DomainCreateRequestSchema>;
export type DomainListDto = z.infer<typeof DomainListSchema>;
export type MetricsDto = z.infer<typeof MetricsSchema>;
export type MetricsListDto = z.infer<typeof MetricsListSchema>;
export type ProjectCreateRequestDto = z.infer<
  typeof ProjectCreateRequestSchema
>;
export type ProjectEnvContentDto = z.infer<typeof ProjectEnvContentSchema>;
export type ProjectEnvResponseDto = z.infer<typeof ProjectEnvResponseSchema>;
export type ProjectEnvUpsertRequestDto = z.infer<
  typeof ProjectEnvUpsertRequestSchema
>;
export type ProjectLogsResponseDto = z.infer<typeof ProjectLogsResponseSchema>;
export type ProjectLogsStreamSnapshotDto = z.infer<
  typeof ProjectLogsStreamSnapshotSchema
>;
export type ProjectLogsStreamLineDto = z.infer<
  typeof ProjectLogsStreamLineSchema
>;
export type ProjectLogsStreamErrorDto = z.infer<
  typeof ProjectLogsStreamErrorSchema
>;
export type ProjectLogsStreamMessageDto = z.infer<
  typeof ProjectLogsStreamMessageSchema
>;
export type ProjectDto = z.infer<typeof ProjectSchema>;
export type ProjectListResponseDto = z.infer<typeof ProjectListResponseSchema>;
export type ProjectNameDto = z.infer<typeof ProjectNameSchema>;
export type ProjectSlugDto = z.infer<typeof ProjectSlugSchema>;
export type ProjectSourceGitBranchDto = z.infer<
  typeof ProjectSourceGitBranchSchema
>;
export type ProjectSourceGitRequestDto = z.infer<
  typeof ProjectSourceGitRequestSchema
>;
export type ProjectSourceTypeDto = z.infer<typeof ProjectSourceTypeSchema>;
export type ProjectSourceGitUrlDto = z.infer<typeof ProjectSourceGitUrlSchema>;
export type ProjectUpdateRequestDto = z.infer<
  typeof ProjectUpdateRequestSchema
>;
export type ServiceDto = z.infer<typeof ServiceSchema>;
export type ServiceActionDto = z.infer<typeof ServiceActionSchema>;
export type ServiceActionRequestDto = z.infer<
  typeof ServiceActionRequestSchema
>;
