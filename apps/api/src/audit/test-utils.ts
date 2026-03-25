import type { AuditLogRepository } from "./repository.js";

export type AuditLogRecord = Parameters<
  AuditLogRepository["createAuditLog"]
>[0];

export const createAuditLogCapture = () => {
  const records: AuditLogRecord[] = [];

  return {
    auditLogRepository: {
      async createAuditLog(input: AuditLogRecord) {
        records.push({
          ...input,
        });
      },
    } satisfies AuditLogRepository,
    clearAuditLogs: () => {
      records.length = 0;
    },
    listAuditLogs: () => {
      return records.map((record) => ({
        ...record,
      }));
    },
  };
};
