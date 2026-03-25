import assert from "node:assert/strict";
import test from "node:test";

import { createAuditService } from "./service.js";

test("createAuditService returns DTO-safe audit logs and forwards the requested limit", async () => {
  const calls: Array<{
    action: string;
    entityType: string;
    page: number;
    pageSize: number;
    q: string;
  }> = [];
  const service = createAuditService({
    auditLogRepository: {
      async listAuditLogs(input) {
        calls.push(input);

        return {
          auditLogs: [
            {
              action: "ENV_UPDATE",
              createdAt: new Date("2026-03-23T10:01:00.000Z"),
              entityId: "env_1",
              entityType: "env",
              id: "audit_2",
              message: "Environment updated",
              projectId: "project_1",
              userId: "user_admin",
            },
            {
              action: "AUTH_LOGIN",
              createdAt: new Date("2026-03-23T10:00:00.000Z"),
              entityId: null,
              entityType: "auth",
              id: "audit_1",
              message: "Admin login succeeded",
              projectId: null,
              userId: "user_admin",
            },
          ],
          page: 2,
          pageSize: 25,
          total: 26,
          totalPages: 2,
        };
      },
      async listAuditLogsForExport() {
        throw new Error("listAuditLogsForExport should not be called here");
      },
    },
  });

  const auditLogs = await service.listAuditLogs({
    action: "ENV_UPDATE",
    entityType: "env",
    page: 2,
    pageSize: 25,
    q: "env",
  });

  assert.deepEqual(calls, [
    {
      action: "ENV_UPDATE",
      entityType: "env",
      page: 2,
      pageSize: 25,
      q: "env",
    },
  ]);
  assert.deepEqual(auditLogs, {
    auditLogs: [
      {
        action: "ENV_UPDATE",
        createdAt: "2026-03-23T10:01:00.000Z",
        entityId: "env_1",
        entityType: "env",
        id: "audit_2",
        message: "Environment updated",
        projectId: "project_1",
        userId: "user_admin",
      },
      {
        action: "AUTH_LOGIN",
        createdAt: "2026-03-23T10:00:00.000Z",
        entityId: null,
        entityType: "auth",
        id: "audit_1",
        message: "Admin login succeeded",
        projectId: null,
        userId: "user_admin",
      },
    ],
    page: 2,
    pageSize: 25,
    total: 26,
    totalPages: 2,
  });
});

test("createAuditService exports all matching audit logs as escaped CSV", async () => {
  const calls: Array<{
    action: string;
    entityType: string;
    q: string;
  }> = [];
  const service = createAuditService({
    auditLogRepository: {
      async listAuditLogs() {
        throw new Error("listAuditLogs should not be called during export");
      },
      async listAuditLogsForExport(input) {
        calls.push(input);

        return [
          {
            action: "ENV_UPDATE",
            createdAt: new Date("2026-03-23T10:01:00.000Z"),
            entityId: "env_1",
            entityType: "env",
            id: "audit_2",
            message: 'Environment updated with "quoted" value',
            projectId: "project_1",
            userId: "user_admin",
          },
          {
            action: "AUTH_LOGIN",
            createdAt: new Date("2026-03-23T10:00:00.000Z"),
            entityId: null,
            entityType: "auth",
            id: "audit_1",
            message: null,
            projectId: null,
            userId: "user_admin",
          },
        ];
      },
    },
  });

  const csv = await service.exportAuditLogsCsv({
    action: "ENV_UPDATE",
    entityType: "env",
    q: "quoted",
  });

  assert.deepEqual(calls, [
    {
      action: "ENV_UPDATE",
      entityType: "env",
      q: "quoted",
    },
  ]);
  assert.equal(
    csv,
    [
      "createdAt,action,entityType,entityId,projectId,userId,message",
      '2026-03-23T10:01:00.000Z,ENV_UPDATE,env,env_1,project_1,user_admin,"Environment updated with ""quoted"" value"',
      "2026-03-23T10:00:00.000Z,AUTH_LOGIN,auth,,,user_admin,",
    ].join("\r\n"),
  );
});
