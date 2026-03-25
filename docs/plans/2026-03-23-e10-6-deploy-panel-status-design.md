# E10-6 — Deploy panel + status

## Goal

Add a real deploy panel to the existing protected `Deployments` tab so an authenticated admin can trigger a deploy, see the latest deploy status, and review a compact recent history without leaving the project detail route.

## Scope

- add guarded web helpers for:
  - `GET /api/projects/:id/deployments`
  - `POST /api/projects/:id/deploy`
- replace the `Deployments` tab shell placeholder with:
  - one deploy summary card
  - one manual `Deploy` action
  - one compact recent history list capped to 5 items
- disable repeat deploy attempts while:
  - the current UI request is still in flight
  - the latest known deployment status is `RUNNING`
- refresh deployment history after a successful or failed manual deploy

## Out of scope

- no polling or background auto-refresh
- no deploy log viewer or drilldown
- no backend or shared DTO changes
- no changes to services, logs, domains, or env flows

## Design

### Data flow

- entering the `Deployments` tab calls guarded `GET /api/projects/:id/deployments`
- the UI treats the first item as the latest deployment and trims the rendered history to the latest 5 records
- manual deploy calls guarded `POST /api/projects/:id/deploy`
- while the request is in flight, the button is disabled and the panel shows a loading notice
- after the request resolves, the UI surfaces the returned final deployment status and reloads history from the list endpoint
- requests reuse the same refresh-on-`401` pattern already used by metrics and project pages

### UI behavior

- keep the current project detail header and tab navigation unchanged
- inside the `Deployments` tab render:
  - one status summary card for the latest deploy
  - one primary `Deploy` button
  - one inline feedback area for loading, success, conflict, and failure states
  - one recent history list with newest-first items and status pills
- use inline status pills for `RUNNING`, `SUCCESS`, and `FAILED`
- when no deployments exist yet, show a clear empty state and keep the deploy action available

## Testing

- add web tests for:
  - deployments list request + parsing
  - deploy trigger request + parsing
  - recent-history trimming helper behavior
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
  - `curl -fsS http://localhost:8080/api/health`
