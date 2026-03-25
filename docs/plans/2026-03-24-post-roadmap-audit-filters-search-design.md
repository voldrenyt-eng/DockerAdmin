# Post-roadmap — Audit filters and search in web

## Goal

Extend the existing protected `/audit` page with fast client-side search and filters so admins can narrow the latest audit snapshot without changing the backend API.

## Scope

- keep the existing guarded `GET /api/audit?limit=50` flow unchanged
- add one local free-text search field on the audit page
- add one local `action` filter and one local `entity type` filter
- persist the current filter state in the `/audit` URL query
- keep the page read-only and keep the current AppShell visual language

## Out of scope

- no backend audit API changes
- no server-side filtering or pagination
- no audit export flow
- no detail drawer or diff view
- no release automation work

## Design

### Data model

- introduce one small web helper dedicated to audit page filter state
- use a narrow shape:
  - `query`
  - `action`
  - `entityType`
- store query state in URL params as:
  - `q`
  - `action`
  - `entityType`
- omit empty or default values from the URL so `/audit` stays clean by default

### Filtering behavior

- fetch the latest `50` audit records exactly once per page load, using the existing helper
- derive visible rows locally from the loaded records
- treat search as case-insensitive substring matching across the visible audit values:
  - `action`
  - `entityType`
  - `projectId`
  - `message`
- keep exact-value filters for `action` and `entityType`
- build filter option lists from the currently loaded audit records so the UI never invents values

### UI shape

- keep the existing page heading and main panel
- add a compact filter row above the table:
  - search input
  - action select
  - entity type select
- reuse existing field and table styles
- show the filtered row count in the panel pill instead of the static `50`
- keep loading, empty, and error states
- when loaded records exist but filters match nothing, show a dedicated filtered-empty message instead of the generic empty state

### URL behavior

- read initial filter state from the current `/audit` query string
- update the URL whenever the local filter state changes
- keep filter changes local to the page; do not trigger another backend request
- use `replace` navigation semantics so typing in search does not spam browser history

## Testing

- add failing tests first for:
  - parsing audit filter state from URL params
  - serializing non-default audit filter state back to URL params
  - case-insensitive local filtering across search and exact filters
  - shared i18n keys for the new audit filter UI

## Verification

- `pnpm --filter @dockeradmin/web test`
- `pnpm --filter @dockeradmin/web lint`
- `pnpm --filter @dockeradmin/web typecheck`
- `pnpm --filter @dockeradmin/web build`
