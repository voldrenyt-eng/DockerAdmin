# E10-4 — Project detail shell

## Goal

Add the first protected project detail page to `apps/web` so an authenticated admin can open one project, see its core identity in a stable header, and move between dedicated tab URLs for the next frontend batches.

## Scope

- add project detail routes under `/projects/:projectId/:tab`
- redirect `/projects/:projectId` to the default `services` tab
- load guarded `GET /api/projects/:id` for the detail header
- show tab navigation for:
  - `Services`
  - `Logs`
  - `Domains`
  - `Deployments`
  - `Env`
- add a navigation action from the projects list into the detail route
- keep tabs as shell placeholders only in this batch

## Out of scope

- no env editor yet
- no deploy trigger panel yet
- no services actions, logs stream UI, or domains CRUD UI yet
- no backend or shared DTO changes

## Design

### Routing

- keep `/projects` as the catalog page
- add nested detail URLs as `/projects/:projectId/:tab`
- canonical default route is `/projects/:projectId/services`
- invalid or missing tab segments redirect to the default tab instead of silently rendering a fallback under a bad URL

### Page structure

- reuse the existing protected app shell with the same sidebar and topbar
- render page heading, back action, and header card inside the existing workspace canvas
- header shows:
  - project name
  - project slug
  - project source type
  - backend project id
- tabs render as pill-style buttons under the header and switch by route navigation

### Data flow

- page load calls guarded `GET /api/projects/:id`
- requests reuse the same refresh-on-`401` callback pattern already used for metrics and projects list
- if refresh fails, the existing auth flow clears the local session and routes back to `/login`
- tab content stays static in this batch but each tab declares the primary backend endpoint it will own in later slices

## Testing

- add route helper tests for:
  - supported tab parsing
  - default tab fallback
  - nested detail path generation
- add project helper coverage for:
  - `GET /api/projects/:id`
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
  - `curl -fsS http://localhost:8080/api/health`
