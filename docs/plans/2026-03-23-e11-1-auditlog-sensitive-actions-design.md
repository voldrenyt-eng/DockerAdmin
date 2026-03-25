# E11-1 — AuditLog for sensitive actions

## Goal

Close the remaining AuditLog coverage gaps for sensitive backend actions so the MVP records safe high-level audit events for auth, project metadata, source ingestion, env updates, deploys, service actions, and domain changes without leaking secrets.

## Scope

- keep existing deploy and service action audit behavior in place
- add best-effort audit writes for:
  - `login` success and failure
  - `logout`
  - project create and update
  - ZIP source upload
  - Git source clone
  - project env update
  - domain create and delete
- keep audit messages high-level and secret-free
- thread `userId` through service entry points where the caller already knows the authenticated admin

## Out of scope

- no new audit API or pagination
- no audit schema redesign or enum renames
- no broader auth/session refactor
- no changes to deploy or service action semantics beyond preserving current behavior

## Design

### Write location

- follow the existing pattern already used by `deploy` and `services`
- add optional `auditLogRepository` dependencies to:
  - `authService`
  - `projectService`
  - `sourceService`
  - `envService`
  - `domainService`
- keep audit persistence best-effort, so a failed audit write never changes the business outcome
- keep the write decision in the service layer rather than duplicating it in `server.ts`

### Action mapping

- use the existing Prisma enum values exactly as they already exist:
  - `AUTH_LOGIN`
  - `AUTH_LOGOUT`
  - `PROJECT_CREATE`
  - `PROJECT_UPDATE`
  - `SOURCE_UPLOAD`
  - `SOURCE_CLONE`
  - `ENV_UPDATE`
  - `DOMAIN_UPSERT`
- keep existing `DEPLOY_START`, `DEPLOY_FINISH`, and `SERVICE_ACTION` unchanged

### Record shape and safety policy

- auth success/fail/logout:
  - `entityType: "auth"`
  - `entityId: userId | null`
  - `projectId: null`
- project create/update, source upload/clone, env update:
  - `entityType: "project"`
  - `entityId: project.id`
  - `projectId: project.id`
- domain create/delete:
  - `entityType: "domain"`
  - `entityId: domain.id`
  - `projectId: domain.projectId`
- safe messages:
  - `Login succeeded`
  - `Login failed`
  - `Logout succeeded`
  - `Project created`
  - `Project updated`
  - `ZIP source uploaded`
  - `Git source cloned`
  - `Project env updated`
  - `Domain binding created`
  - `Domain binding deleted`
- never persist:
  - passwords
  - refresh tokens or token hashes
  - raw env content
  - ZIP payload content
  - Git clone stderr/stdout
  - domain secrets or deploy output

### Route plumbing

- `server.ts` already passes `userId` for deploy and service actions
- extend the protected route calls to also pass `request.currentUser?.id ?? null` into:
  - project create
  - project update
  - project env update
  - source ZIP upload
  - source Git clone
  - domain create
  - domain delete
- auth login/logout keep using the public handlers and capture the needed actor inside `authService`

## Testing

- add backend failing tests first for:
  - auth login success/fail and logout audit writes
  - project create/update audit writes
  - ZIP upload and Git clone audit writes
  - env update audit write
  - domain create/delete audit writes
- assert that:
  - correct action names are written
  - `entityType`, `entityId`, `projectId`, and `userId` are correct
  - safe messages do not include secrets or payload content
- verify with:
  - `pnpm test:api`
  - `curl -fsS http://localhost/api/health`
  - `curl -fsS http://localhost:8080/api/health`
