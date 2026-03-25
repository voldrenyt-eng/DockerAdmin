# Post-roadmap — Audit CSV export

## Goal

Add a protected audit export flow that downloads all audit rows matching the current server-side search and exact filters as one CSV file.

## Scope

- add a guarded audit export endpoint in the API
- reuse the existing audit filter semantics:
  - `q`
  - `action`
  - `entityType`
- export all matching rows in newest-first order
- add one `Export CSV` control to the existing `/audit` page
- keep the current protected `/audit` route, numbered pagination, and read-only detail drawer unchanged

## Out of scope

- no current-page-only export
- no background export jobs
- no ZIP/XLSX/PDF formats
- no export history or audit-export audit records
- no custom column picker

## Design

### API shape

- add guarded `GET /api/audit/export`
- accept the same dataset-shaping query params as the paginated list flow:
  - `q`
  - `action`
  - `entityType`
- do not accept or require:
  - `page`
  - `pageSize`
- return:
  - `content-type: text/csv; charset=utf-8`
  - `content-disposition: attachment; filename="audit-export-YYYY-MM-DD.csv"`
- keep newest-first ordering with the same stable tie-breaker:
  - `createdAt desc`
  - `id desc`

### CSV shape

- header row:
  - `createdAt`
  - `action`
  - `entityType`
  - `entityId`
  - `projectId`
  - `userId`
  - `message`
- encode as UTF-8 CSV
- escape embedded quotes by doubling them
- wrap fields in quotes when needed
- represent `null` values as empty cells

### Backend flow

- reuse the current audit filter `where` builder so list and export stay semantically aligned
- add a repository read that returns all matching rows for export without pagination metadata
- add a service export method that converts rows into CSV text and isolates CSV formatting from the route
- keep export read-only and best-effort; failures return the existing standardized API errors

### Web flow

- add one `Export CSV` button in the audit page header beside the existing result count
- the button uses the current URL-backed `q/action/entityType` state, but ignores:
  - `page`
  - `pageSize`
  - `selected`
- the page fetches the CSV with bearer auth, then triggers a browser download using the filename from `content-disposition` when present
- while export is in flight:
  - disable the export button
  - show a loading label
- export failures surface through the existing audit error area with a dedicated fallback message

## Testing

- add failing tests first for:
  - guarded `GET /api/audit/export` query validation and success response headers
  - repository export query with the shared filter `where` and newest-first ordering
  - service CSV formatting and null/quote escaping
  - web audit export helper request URL, auth header, retry-on-401, and filename parsing
  - i18n labels for export action and loading state

## Verification

- `pnpm --filter @dockeradmin/api test -- src/audit/repository.test.ts src/audit/service.test.ts src/audit/endpoints.test.ts`
- `pnpm --filter @dockeradmin/web test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`
