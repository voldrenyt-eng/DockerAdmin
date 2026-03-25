# Post-roadmap — Audit pagination in API and web

## Goal

Extend the protected `/audit` flow with full numbered pagination across the whole audit history instead of the current latest-50 snapshot.

## Scope

- replace the current fixed latest-50 audit fetch with backend-backed pagination
- move audit search and exact filters from local-only web state to backend query params
- keep the existing protected `/audit` route, table, and read-only detail drawer
- persist pagination, filters, and drawer state in the `/audit` URL query
- keep newest-first ordering across all pages

## Out of scope

- no audit export flow in this batch
- no diff/timeline UI
- no edit actions
- no custom sorting beyond newest-first
- no release automation work

## Design

### API contract

- extend `GET /api/audit` query params with:
  - `page`
  - `pageSize`
  - `q`
  - `action`
  - `entityType`
- defaults:
  - `page = 1`
  - `pageSize = 25`
- validation:
  - `page >= 1`
  - `pageSize >= 1`
  - `pageSize <= 100`
- replace the current `{ auditLogs }` response with a paginated shape:
  - `auditLogs`
  - `page`
  - `pageSize`
  - `total`
  - `totalPages`
- keep the API newest-first only; no additional sort parameter is introduced

### Filtering semantics

- move free-text search and exact filters to the backend so they apply to the whole audit history
- keep exact filters for:
  - `action`
  - `entityType`
- keep case-insensitive substring search for:
  - `action`
  - `entityType`
  - `projectId`
  - `message`
- do not expand search to new fields in this batch

### Repository and query behavior

- replace the current `take: limit` query with paginated Prisma reads using:
  - `skip = (page - 1) * pageSize`
  - `take = pageSize`
  - `orderBy = [{ createdAt: "desc" }, { id: "desc" }]`
- compute `total` with a separate `count()` call using the same `where` clause as `findMany()`
- retain the existing stable tie-breaker on `id desc` so numbered pages stay deterministic
- if the requested page is larger than the actual `totalPages`, normalize the returned `page` down to the last available page
- when no rows match, return:
  - `auditLogs: []`
  - `page: 1`
  - `pageSize`
  - `total: 0`
  - `totalPages: 0`

### Web state model

- the `/audit` page reads and writes:
  - `page`
  - `pageSize`
  - `q`
  - `action`
  - `entityType`
  - `selected`
- omit default query values from the URL so the clean default route stays `/audit`
- changes to:
  - `q`
  - `action`
  - `entityType`
  - `pageSize`
  always reset `page` to `1`
- changes to dataset-shaping params also clear `selected`
- page changes keep the active filters but clear `selected`
- if the backend normalizes the current page, the web route replaces the URL with the normalized page value

### UI shape

- keep the current page heading, filters row, table, and read-only detail drawer
- replace the current pill count with the total number of matching audit rows
- add a footer pagination area under the table with:
  - `Previous`
  - numbered page buttons
  - `Next`
  - one range summary such as `26-50 of 137`
- keep numbered pagination 1-based
- do not add export controls or advanced page-jump UI in this batch

### Interaction details

- text search triggers backend fetches with debounce
- text-search URL updates use `replace: true`
- numbered page clicks should preserve browser history semantics so `Back` can return to the previous page
- the detail drawer remains URL-backed via `selected`
- the drawer remains read-only and uses only the current page payload
- if the selected audit id is absent from the current page results after a fetch, the drawer closes automatically
- loading, empty, and error states remain, but empty-after-filters now reflects backend-filtered results rather than client-side filtering on one snapshot

## Testing

- add failing tests first for:
  - parsing and serializing paginated audit URL state
  - resetting page to `1` when filters or page size change
  - preserving active filters while changing page
  - closing the drawer when the selected row is missing from the current page result
  - shared paginated audit DTO parsing
  - backend query validation for `page` and `pageSize`
  - backend repository pagination with shared `where`, `count`, `skip`, `take`, and stable ordering

## Verification

- `pnpm --filter @dockeradmin/shared test`
- `pnpm --filter @dockeradmin/api test`
- `pnpm --filter @dockeradmin/web test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`
