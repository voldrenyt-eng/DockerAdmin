import assert from "node:assert/strict";
import test from "node:test";

import { createPrismaAuditLogRepository } from "./repository.js";

test("createPrismaAuditLogRepository queries paginated audit logs with shared filters and stable ordering", async () => {
  let capturedCountArgs: unknown;
  let capturedFindManyArgs: unknown;
  const repository = createPrismaAuditLogRepository({
    auditLog: {
      async create() {
        return undefined;
      },
      async count(args: unknown) {
        capturedCountArgs = args;

        return 5;
      },
      async findMany(args: unknown) {
        capturedFindManyArgs = args;

        return [
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
        ];
      },
    },
  } as never);

  const auditLogs = await repository.listAuditLogs({
    action: "ENV_UPDATE",
    entityType: "env",
    page: 5,
    pageSize: 2,
    q: "env",
  });

  assert.deepEqual(capturedCountArgs, {
    where: {
      OR: [
        {
          action: {
            in: ["ENV_UPDATE"],
          },
        },
        {
          entityType: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          projectId: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          message: {
            contains: "env",
            mode: "insensitive",
          },
        },
      ],
      action: "ENV_UPDATE",
      entityType: "env",
    },
  });
  assert.deepEqual(capturedFindManyArgs, {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 4,
    take: 2,
    where: {
      OR: [
        {
          action: {
            in: ["ENV_UPDATE"],
          },
        },
        {
          entityType: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          projectId: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          message: {
            contains: "env",
            mode: "insensitive",
          },
        },
      ],
      action: "ENV_UPDATE",
      entityType: "env",
    },
  });
  assert.deepEqual(auditLogs, {
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
    page: 3,
    pageSize: 2,
    total: 5,
    totalPages: 3,
  });
});

test("createPrismaAuditLogRepository queries all matching audit logs for CSV export with shared filters and stable ordering", async () => {
  let capturedFindManyArgs: unknown;
  const repository = createPrismaAuditLogRepository({
    auditLog: {
      async create() {
        return undefined;
      },
      async count() {
        return 0;
      },
      async findMany(args: unknown) {
        capturedFindManyArgs = args;

        return [
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
        ];
      },
    },
  } as never);

  const auditLogs = await repository.listAuditLogsForExport({
    action: "ENV_UPDATE",
    entityType: "env",
    q: "env",
  });

  assert.deepEqual(capturedFindManyArgs, {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: {
      OR: [
        {
          action: {
            in: ["ENV_UPDATE"],
          },
        },
        {
          entityType: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          projectId: {
            contains: "env",
            mode: "insensitive",
          },
        },
        {
          message: {
            contains: "env",
            mode: "insensitive",
          },
        },
      ],
      action: "ENV_UPDATE",
      entityType: "env",
    },
  });
  assert.deepEqual(auditLogs, [
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
  ]);
});
