import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogDto } from "@dockeradmin/shared";

import {
  createAuditDetailSearchParams,
  readSelectedAuditId,
  resolveSelectedAuditLog,
} from "./audit-detail.js";

const createAuditLogFixture = (
  overrides: Partial<AuditLogDto> = {},
): AuditLogDto => ({
  action: "PROJECT_CREATE",
  createdAt: "2026-03-23T12:00:00.000Z",
  entityId: "project_1",
  entityType: "project",
  id: "audit_1",
  message: "Project created successfully",
  projectId: "project_1",
  userId: "user_admin",
  ...overrides,
});

test("readSelectedAuditId restores the selected audit id from URL params", () => {
  assert.equal(
    readSelectedAuditId(new URLSearchParams("selected=audit_42")),
    "audit_42",
  );
  assert.equal(readSelectedAuditId(new URLSearchParams("selected=   ")), null);
  assert.equal(readSelectedAuditId(new URLSearchParams("")), null);
});

test("createAuditDetailSearchParams preserves active filters while adding selected audit id", () => {
  assert.equal(
    createAuditDetailSearchParams({
      filterState: {
        action: "DEPLOY_FINISH",
        entityType: "deployment",
        page: 2,
        pageSize: 50,
        query: "failed",
      },
      selectedAuditId: "audit_2",
    }).toString(),
    "q=failed&action=DEPLOY_FINISH&entityType=deployment&page=2&pageSize=50&selected=audit_2",
  );
});

test("createAuditDetailSearchParams omits selected when the drawer is closed", () => {
  assert.equal(
    createAuditDetailSearchParams({
      filterState: {
        action: "all",
        entityType: "all",
        page: 1,
        pageSize: 25,
        query: "",
      },
      selectedAuditId: null,
    }).toString(),
    "",
  );
});

test("resolveSelectedAuditLog returns the selected visible row or null when it is missing", () => {
  const visibleAuditLogs = [
    createAuditLogFixture(),
    createAuditLogFixture({
      action: "DEPLOY_FINISH",
      entityId: "deploy_1",
      entityType: "deployment",
      id: "audit_2",
      message: "Deploy finished successfully",
    }),
  ];

  assert.equal(
    resolveSelectedAuditLog(visibleAuditLogs, "audit_2")?.id,
    "audit_2",
  );
  assert.equal(resolveSelectedAuditLog(visibleAuditLogs, "audit_9"), null);
  assert.equal(resolveSelectedAuditLog(visibleAuditLogs, null), null);
});
