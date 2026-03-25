import type {
  AuditActionDto,
  AuditLogDto,
  AuditLogListResponseDto,
} from "@dockeradmin/shared";

import type { AuditLogListRepository } from "./repository.js";

export type AuditService = {
  listAuditLogs: (input: {
    action: AuditActionDto | "";
    entityType: string;
    page: number;
    pageSize: number;
    q: string;
  }) => Promise<AuditLogListResponseDto>;
  exportAuditLogsCsv: (input: {
    action: AuditActionDto | "";
    entityType: string;
    q: string;
  }) => Promise<string>;
};

type CreateAuditServiceOptions = {
  auditLogRepository: AuditLogListRepository;
};

const toAuditLogDto = (
  record: Awaited<
    ReturnType<AuditLogListRepository["listAuditLogs"]>
  >["auditLogs"][number],
): AuditLogDto => ({
  action: record.action,
  createdAt: record.createdAt.toISOString(),
  entityId: record.entityId,
  entityType: record.entityType,
  id: record.id,
  message: record.message,
  projectId: record.projectId,
  userId: record.userId,
});

const auditCsvHeader = [
  "createdAt",
  "action",
  "entityType",
  "entityId",
  "projectId",
  "userId",
  "message",
];

const escapeCsvCell = (value: string | null): string => {
  const normalized = value ?? "";
  const escaped = normalized.replaceAll('"', '""');

  if (
    escaped.includes(",") ||
    escaped.includes('"') ||
    escaped.includes("\n") ||
    escaped.includes("\r")
  ) {
    return `"${escaped}"`;
  }

  return escaped;
};

const toAuditCsvRow = (
  record: Awaited<
    ReturnType<AuditLogListRepository["listAuditLogsForExport"]>
  >[number],
): string => {
  return [
    record.createdAt.toISOString(),
    record.action,
    record.entityType,
    record.entityId,
    record.projectId,
    record.userId,
    record.message,
  ]
    .map(escapeCsvCell)
    .join(",");
};

export const createAuditService = ({
  auditLogRepository,
}: CreateAuditServiceOptions): AuditService => ({
  async listAuditLogs(input) {
    const records = await auditLogRepository.listAuditLogs(input);

    return {
      auditLogs: records.auditLogs.map(toAuditLogDto),
      page: records.page,
      pageSize: records.pageSize,
      total: records.total,
      totalPages: records.totalPages,
    };
  },
  async exportAuditLogsCsv(input) {
    const records = await auditLogRepository.listAuditLogsForExport(input);

    return [auditCsvHeader.join(","), ...records.map(toAuditCsvRow)].join(
      "\r\n",
    );
  },
});
