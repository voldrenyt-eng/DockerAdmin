# E10-3 — Projects list + create project (zip/git)

## Goal

Add the first real projects page to `apps/web` so an authenticated admin can view the existing project list and create a new project through the UI, including the required ZIP or Git source intake step.

## Scope

- add a protected `/projects` route
- load and render `GET /api/projects`
- show a `Create Project` action in the projects page
- create project metadata through `POST /api/projects`
- complete the source step through either:
  - `POST /api/projects/:id/source/zip`
  - `POST /api/projects/:id/source/git`
- show basic loading, empty, success, and error states

## Out of scope

- no project detail page yet
- no projects search, filters, pagination, or edit flow
- no deploy, logs, services, domains, or env UI in this batch
- no backend or shared DTO changes

## Design

### Route and page shape

- keep the current protected app shell
- add `/projects` as a new protected route
- render one projects page inside the existing canvas with:
  - heading
  - projects list panel
  - create-project side panel/drawer

### Data flow

- page load calls guarded `GET /api/projects`
- the list shows `name`, `slug`, and `sourceType`
- create flow is two-step inside one panel:
  1. create metadata: `name` + `sourceType`
  2. attach source:
     - ZIP file upload for `zip`
     - `url` + optional `branch` for `git`
- metadata creation and source intake together form the successful create flow for this slice
- if metadata succeeds but source intake fails, the panel stays open and retries only the second step

### Auth behavior

- reuse the existing browser auth session and access token
- guarded projects requests retry once after a `401` by using the same refresh callback pattern already used for metrics
- if refresh fails, clear the local session and route back to `/login`

## Testing

- add web tests for:
  - projects list request + parsing
  - project create request + parsing
  - ZIP source upload request
  - Git source request
  - transparent retry after one `401`
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
