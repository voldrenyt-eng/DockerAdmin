import { AuditActionSchema } from "@dockeradmin/shared";
import type { AuditAction, Prisma, PrismaClient } from "@prisma/client";

export type AuditLogCreateInput = {
  action: AuditAction;
  entityId: string | null;
  entityType: string;
  message: string | null;
  projectId: string | null;
  userId: string | null;
};

export type AuditLogRepository = {
  createAuditLog: (input: AuditLogCreateInput) => Promise<void>;
};

export type AuditLogListInput = {
  action: AuditAction | "";
  entityType: string;
  q: string;
};

export type AuditLogListPageInput = AuditLogListInput & {
  page: number;
  pageSize: number;
};

export type AuditLogListRecord = {
  action: AuditAction;
  createdAt: Date;
  entityId: string | null;
  entityType: string;
  id: string;
  message: string | null;
  projectId: string | null;
  userId: string | null;
};

export type AuditLogListRepository = {
  listAuditLogs: (input: AuditLogListPageInput) => Promise<{
    auditLogs: AuditLogListRecord[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  listAuditLogsForExport: (
    input: AuditLogListInput,
  ) => Promise<AuditLogListRecord[]>;
};

const buildAuditLogWhereClause = (
  input: AuditLogListInput,
): Prisma.AuditLogWhereInput => {
  const q = input.q.trim();
  const entityType = input.entityType.trim();
  const where: Prisma.AuditLogWhereInput = {};

  if (input.action !== "") {
    where.action = input.action;
  }

  if (entityType.length > 0) {
    where.entityType = entityType;
  }

  if (q.length > 0) {
    const matchingAuditActions = AuditActionSchema.options.filter((action) => {
      return action.toLowerCase().includes(q.toLowerCase());
    });
    const orFilters: Prisma.AuditLogWhereInput[] = [
      {
        entityType: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        projectId: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        message: {
          contains: q,
          mode: "insensitive",
        },
      },
    ];

    if (matchingAuditActions.length > 0) {
      orFilters.unshift({
        action: {
          in: matchingAuditActions,
        },
      });
    }

    where.OR = orFilters;
  }

  return where;
};

export const createPrismaAuditLogRepository = (
  prisma: PrismaClient,
): AuditLogRepository & AuditLogListRepository => ({
  async createAuditLog(input) {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityId: input.entityId,
        entityType: input.entityType,
        message: input.message,
        projectId: input.projectId,
        userId: input.userId,
      },
    });
  },
  async listAuditLogs(input) {
    const where = buildAuditLogWhereClause(input);
    const total = await prisma.auditLog.count({
      where,
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
    const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages);
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: totalPages === 0 ? 0 : (page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    });

    return {
      auditLogs,
      page,
      pageSize: input.pageSize,
      total,
      totalPages,
    };
  },
  async listAuditLogsForExport(input) {
    const where = buildAuditLogWhereClause(input);

    return prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where,
    });
  },
});
