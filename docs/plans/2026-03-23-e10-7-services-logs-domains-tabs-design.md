# E10-7 — Services + Logs + Domains tabs

## Goal

Replace the remaining `Services`, `Logs`, and `Domains` tab shells in the protected project detail route with real guarded runtime workflows so an authenticated admin can operate a project without leaving `/projects/:projectId/:tab`.

## Scope

- add guarded web helpers for:
  - `GET /api/projects/:id/services`
  - `POST /api/services/:serviceId/action`
  - `GET /api/projects/:id/logs`
  - `GET /api/domains`
  - `POST /api/domains`
  - `DELETE /api/domains/:id`
- add a lightweight logs websocket helper for:
  - `WS /api/ws/logs?projectId=&serviceName=&tail=&accessToken=`
- replace the three shell placeholders with:
  - a services list with row-level `start|stop|restart` actions
  - a logs tab with one selected service, initial HTTP snapshot, and live WS append
  - a domains tab with current project bindings plus create/delete
- keep explicit loading, empty, success, and error states inside the existing detail route

## Out of scope

- no URL-synced filters or pagination
- no multi-service live logs at once
- no domain edit flow
- no service metrics or deploy polling
- no backend or shared DTO changes

## Design

### Data flow

- `Services` tab loads guarded `GET /api/projects/:id/services`
- row actions call guarded `POST /api/services/:serviceId/action` and then reload the project service list
- `Logs` tab reuses the current service list as the source selector
- once a service is selected, the tab loads guarded `GET /api/projects/:id/logs?serviceName=&tail=` for the initial snapshot
- after the snapshot, the tab opens `WS /api/ws/logs?...&accessToken=...` and appends incoming `snapshot|line|error` frames to the visible log buffer
- changing service, changing project, or leaving the tab closes the active websocket before a new one opens
- `Domains` tab loads guarded `GET /api/domains`, filters the result by `projectId`, and mutates through `POST /api/domains` plus `DELETE /api/domains/:id`
- all HTTP requests reuse the same refresh-on-`401` pattern already used by the existing web helpers

### UI behavior

- keep the current project detail header and tab navigation unchanged
- `Services` tab renders a compact runtime inventory with:
  - status pill
  - image
  - ports
  - row-level action buttons
- `Logs` tab renders:
  - service selector
  - live connection state
  - bounded visible log output area
  - inline error notice for safe websocket `error` frames
- `Domains` tab renders:
  - current project domain list
  - a narrow create form for `host`, `serviceName`, `port`, and `tlsEnabled`
  - delete buttons on existing bindings
- stay inside the existing panel and tool-card language; do not introduce new layout primitives

## Testing

- add web tests for:
  - services list request + action request parsing
  - logs snapshot request parsing
  - domains list/create/delete requests
  - logs websocket URL + stream message handling helper behavior
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
  - `curl -fsS http://localhost:8080/api/health`
