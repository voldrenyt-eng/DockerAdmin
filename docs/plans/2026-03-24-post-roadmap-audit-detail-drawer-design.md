# Post-roadmap — Audit detail drawer in web

## Goal

Extend the existing protected `/audit` page with a minimal right-side detail drawer so an admin can inspect one audit record in full without leaving the current filtered list.

## Scope

- keep the existing guarded `GET /api/audit?limit=50` flow unchanged
- keep existing local search and exact filters
- add row selection for one visible audit record
- persist the selected audit id in the `/audit` URL query
- show one right-side detail drawer with the selected record fields

## Out of scope

- no backend audit API changes
- no server-side filtering, pagination, or export flow
- no edit actions
- no diff view or record timeline
- no release automation work

## Design

### State model

- keep the existing filter query params:
  - `q`
  - `action`
  - `entityType`
- add one optional query param for drawer state:
  - `selected`
- read the selected id from the current query string on page load
- write the selected id back to the URL with `replace: true`

### Selection rules

- clicking a visible audit row opens the drawer for that row
- clicking the same selected row again keeps it selected
- closing the drawer removes `selected` from the URL
- if the selected id is absent from the currently visible filtered rows, the drawer closes
- if the selected id is absent from the fetched latest-50 snapshot, the drawer stays closed

### UI shape

- keep the current audit page heading and main list panel
- keep search and filter controls above the table
- when one record is selected, render a right-side drawer panel beside the table on desktop and stacked below on narrow screens
- drawer content:
  - timestamp
  - action
  - entity type
  - entity id
  - project id
  - user id
  - message
- show nullable values with the same localized dash placeholder already used in the table
- add one close action in the drawer header

### Interaction details

- selected table row gets a visible active state
- drawer is read-only
- no extra fetch happens when opening or closing the drawer because all detail data already exists in the loaded record payload

## Testing

- add failing tests first for:
  - reading the selected audit id from URL params
  - serializing the selected audit id back into URL params while preserving active filters
  - resolving the selected audit record only from currently visible rows
  - shared i18n keys for the new drawer UI

## Verification

- `pnpm --filter @dockeradmin/web test`
- `pnpm --filter @dockeradmin/web lint`
- `pnpm --filter @dockeradmin/web typecheck`
- `pnpm --filter @dockeradmin/web build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`
