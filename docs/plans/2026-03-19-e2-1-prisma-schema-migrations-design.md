# E2-1 — Prisma Schema + Migrations Design

## Goal
- додати Prisma baseline для PostgreSQL у `apps/api`
- створити першу migration з мінімальними MVP моделями:
  - `User`
  - `RefreshToken`
  - `Project`
  - `Deployment`
  - `Domain`
  - `AuditLog`
- дати reproducible CLI flow для generate/migrate

## Chosen approach
- Prisma lives inside `apps/api/prisma`
- datasource uses existing `DATABASE_URL`
- all primary keys use `String @id @default(cuid())`
- baseline enums are defined now to avoid reworking next auth/projects issues
- migration is created from schema and committed into repo

## In scope
- `prisma` + `@prisma/client` dependencies for API
- Prisma schema with required models and basic relations
- migration scripts:
  - `db:generate`
  - `db:migrate`
  - `db:migrate:deploy`
- one initial migration applied against local Docker PostgreSQL
- docs/status update

## Out of scope
- seed admin
- Prisma client wiring into Fastify runtime
- auth endpoints
- repository/service layer
- business constraints beyond what is needed for upcoming issues

## Model baseline
- `User`
  - `id`, `email`, `passwordHash`, `role`, timestamps
- `RefreshToken`
  - belongs to `User`
  - stores hashed token, expiry/revocation timestamps
- `Project`
  - `id`, `name`, `slug`, `sourceType`, timestamps
- `Deployment`
  - belongs to `Project`
  - `status`, `source`, `trigger`, `startedAt`, `finishedAt`
- `Domain`
  - belongs to `Project`
  - `host`, `serviceName`, `port`, `tlsEnabled`
- `AuditLog`
  - optional links to `User` and `Project`
  - `action`, `entityType`, `entityId`, `message`

## Verification
- failing red-phase first: missing Prisma scripts/schema should fail
- `pnpm --filter @dockeradmin/api exec prisma validate`
- `pnpm db:migrate`
- DB smoke proves required tables exist in PostgreSQL container
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
