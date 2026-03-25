# E11-2 — Audit API

## Goal

Expose a minimal ADMIN-only audit read API so the MVP can inspect already persisted `AuditLog` records without changing existing write behavior or over-designing pagination.

## Scope

- add guarded `GET /api/audit`
- support minimal `limit` control with default `100` and max `100`
- return audit records newest-first
- add shared DTOs for audit list response payloads
- keep the implementation backend-only for this batch

## Out of scope

- no web audit page
- no cursor pagination, filtering, or search
- no Prisma schema changes
- no changes to existing audit action enum values or write semantics

## Design

### Contract shape

- add `AuditActionSchema` to `packages/shared` using the existing Prisma enum values exactly:
  - `AUTH_LOGIN`
  - `AUTH_LOGOUT`
  - `AUTH_REFRESH`
  - `PROJECT_CREATE`
  - `PROJECT_UPDATE`
  - `SOURCE_UPLOAD`
  - `SOURCE_CLONE`
  - `ENV_UPDATE`
  - `DEPLOY_START`
  - `DEPLOY_FINISH`
  - `DOMAIN_UPSERT`
  - `SERVICE_ACTION`
- add `AuditLogSchema` with:
  - `id`
  - `action`
  - `entityType`
  - `entityId`
  - `projectId`
  - `userId`
  - `message`
  - `createdAt`
- return `{ auditLogs: AuditLog[] }` instead of a bare array so later pagination metadata can be added without breaking the response envelope

### Route and auth

- wire `GET /api/audit` in `server.ts`
- keep it under the existing `requireAdminAuth` guard
- parse query locally in API with `z.coerce.number().int().positive().max(100).default(100)`
- keep validation failures on the standard `422 VALIDATION_ERROR` contract

### Read path

- extend the Prisma audit repository with `listAuditLogs({ limit })`
- query with:
  - `orderBy createdAt desc`
  - `orderBy id desc` as a deterministic tie-breaker
  - `take: limit`
- keep the DB model unchanged and map `Date -> ISO string` in a small `audit service`

### Layering choice

- keep `server.ts -> auditService -> auditRepository`
- do not read Prisma directly from the route handler
- keep existing write-only service dependencies unchanged; only the runtime wiring gets one additional `auditService`

## Testing

- add shared contract coverage for:
  - `AuditActionSchema`
  - `AuditLogSchema`
  - `AuditLogListResponseSchema`
- add API tests for:
  - `200` for authenticated admin
  - default `limit=100`
  - standardized `401`
  - standardized `422` for out-of-range limit
- add repository/service tests for:
  - newest-first query shape
  - stable `id desc` tie-breaker
  - `Date -> ISO string` mapping

## Verification

- `pnpm --filter @dockeradmin/shared test`
- `pnpm --filter @dockeradmin/shared lint`
- `pnpm --filter @dockeradmin/shared typecheck`
- `pnpm --filter @dockeradmin/shared build`
- `pnpm --filter @dockeradmin/api test`
- `pnpm --filter @dockeradmin/api lint`
- `pnpm --filter @dockeradmin/api typecheck`
- `pnpm --filter @dockeradmin/api build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost:8080/api/health`
