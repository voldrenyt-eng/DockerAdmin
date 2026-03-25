# Post-roadmap — Audit UX in web

## Goal

Expose the existing guarded audit API in the web app through one narrow read-only admin page.

## Scope

- add one protected `/audit` route in the web app
- add one sidebar navigation item for the audit page
- load the latest audit records from the existing `GET /api/audit?limit=` endpoint
- show loading, empty, success, and error states in the current dashboard UI language
- keep the slice read-only

## Out of scope

- no search, filters, or pagination beyond one fixed limit
- no export flow
- no detail drawer or audit diff view
- no backend audit API changes
- no release automation work

## Design

### Route and placement

- add a protected `/audit` page beside the existing dashboard and projects routes
- wire the page into the current sidebar so it behaves like the other top-level sections
- keep the existing AppShell visual language: sidebar, topbar, page heading, panel, and table

### Data flow

- add a small web helper dedicated to audit reads instead of mixing audit calls into `projects.ts`
- call the existing `GET /api/audit?limit=` endpoint with bearer auth
- reuse the current refresh-on-401 pattern through `onAccessTokenExpired`
- start with a fixed latest-records limit of `50`

### UI shape

- page header with breadcrumb, title, and one short summary
- one primary panel with:
  - a latest-records title
  - a compact summary of what the page shows
  - loading state
  - empty state when the backend returns no records
  - error state when the guarded request fails
  - newest-first table of audit rows
- table columns:
  - timestamp
  - action
  - entity type
  - project
  - message

### Presentation policy

- keep all values exactly as returned by the backend except for timestamp formatting
- do not invent client-side severity scoring or status colors in this first batch
- show nullable fields as a localized dash placeholder instead of leaving cells blank

## Testing

- add failing tests first for:
  - the guarded audit helper success path
  - the guarded audit helper 401 refresh retry path
  - the shared i18n keys needed by the new audit page
- wire the route and navigation after the helper contract is green

## Verification

- `pnpm --filter @dockeradmin/web test`
- `pnpm --filter @dockeradmin/web lint`
- `pnpm --filter @dockeradmin/web typecheck`
- `pnpm --filter @dockeradmin/web build`
