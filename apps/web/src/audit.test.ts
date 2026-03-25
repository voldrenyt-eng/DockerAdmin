import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogDto, AuditLogListResponseDto } from "@dockeradmin/shared";

import { exportAuditLogsCsv, listAuditLogs } from "./audit.js";

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

test("listAuditLogs calls the guarded audit endpoint with pagination and filters and parses the shared response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];
  const responsePayload: AuditLogListResponseDto = {
    auditLogs: [createAuditLogFixture()],
    page: 2,
    pageSize: 25,
    total: 26,
    totalPages: 2,
  };

  const result = await listAuditLogs({
    action: "PROJECT_CREATE",
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    entityType: "project",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify(responsePayload), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    page: 2,
    pageSize: 25,
    q: "project created",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/audit?page=2&pageSize=25&q=project+created&action=PROJECT_CREATE&entityType=project",
    },
  ]);
  assert.deepEqual(result, responsePayload);
});

test("listAuditLogs retries once with a refreshed access token after a 401 response", async () => {
  const seenAuthorizationHeaders: string[] = [];
  let refreshCalls = 0;

  const result = await listAuditLogs({
    action: "",
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    entityType: "",
    fetchImpl: async (_input, init) => {
      const authorizationHeader =
        new Headers(init?.headers).get("authorization") ?? "";

      seenAuthorizationHeaders.push(authorizationHeader);

      if (authorizationHeader === "Bearer token_1") {
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired access token",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 401,
          },
        );
      }

      return new Response(
        JSON.stringify({
          auditLogs: [createAuditLogFixture()],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    onAccessTokenExpired: async () => {
      refreshCalls += 1;

      return "token_2";
    },
    page: 1,
    pageSize: 25,
    q: "",
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(seenAuthorizationHeaders, [
    "Bearer token_1",
    "Bearer token_2",
  ]);
  assert.deepEqual(result, {
    auditLogs: [createAuditLogFixture()],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  });
});

test("exportAuditLogsCsv calls the guarded audit export endpoint with filters and parses the filename", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];
  const csvContent =
    "createdAt,action,entityType,entityId,projectId,userId,message\r\n" +
    "2026-03-23T12:00:00.000Z,PROJECT_CREATE,project,project_1,project_1,user_admin,Project created successfully";

  const result = await exportAuditLogsCsv({
    action: "PROJECT_CREATE",
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    entityType: "project",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(csvContent, {
        headers: {
          "content-disposition":
            'attachment; filename="audit-export-2026-03-25.csv"',
          "content-type": "text/csv; charset=utf-8",
        },
        status: 200,
      });
    },
    q: "project created",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/audit/export?q=project+created&action=PROJECT_CREATE&entityType=project",
    },
  ]);
  assert.deepEqual(result, {
    content: csvContent,
    filename: "audit-export-2026-03-25.csv",
  });
});

test("exportAuditLogsCsv retries once with a refreshed access token after a 401 response", async () => {
  const seenAuthorizationHeaders: string[] = [];
  let refreshCalls = 0;

  const result = await exportAuditLogsCsv({
    action: "",
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    entityType: "",
    fetchImpl: async (_input, init) => {
      const authorizationHeader =
        new Headers(init?.headers).get("authorization") ?? "";

      seenAuthorizationHeaders.push(authorizationHeader);

      if (authorizationHeader === "Bearer token_1") {
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired access token",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 401,
          },
        );
      }

      return new Response(
        "createdAt,action\r\n2026-03-23T12:00:00.000Z,AUTH_LOGIN",
        {
          headers: {
            "content-type": "text/csv; charset=utf-8",
          },
          status: 200,
        },
      );
    },
    onAccessTokenExpired: async () => {
      refreshCalls += 1;

      return "token_2";
    },
    q: "",
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(seenAuthorizationHeaders, [
    "Bearer token_1",
    "Bearer token_2",
  ]);
  assert.deepEqual(result, {
    content: "createdAt,action\r\n2026-03-23T12:00:00.000Z,AUTH_LOGIN",
    filename: "audit-export.csv",
  });
});
