# E10-5 — Project env editor

## Goal

Add a real env editor to the existing `Env` tab in the protected project detail shell so an authenticated admin can load and save project env content through the existing backend policy.

## Scope

- add guarded web helpers for:
  - `GET /api/projects/:id/env`
  - `PUT /api/projects/:id/env`
- replace the `Env` tab shell placeholder with a textarea-based editor
- load env content when the `Env` tab opens
- if the backend returns `404`, treat it as "env not set yet" and show a blank editor with a notice
- show save loading, success, and error states

## Out of scope

- no secret masking or per-key structured env UI
- no deploy integration or validation preview
- no services/logs/domains UI in this batch
- no backend or shared DTO changes

## Design

### Data flow

- entering the `Env` tab calls guarded `GET /api/projects/:id/env`
- successful reads hydrate the textarea with the raw env content from the shared DTO
- a standardized `404` means no env file exists yet, so the editor opens blank and remains saveable
- save calls guarded `PUT /api/projects/:id/env` with `{ content }`
- requests reuse the same refresh-on-`401` pattern already used by metrics and project pages

### UI behavior

- keep the current project detail header and tab navigation unchanged
- inside the `Env` tab render:
  - one editor card
  - one textarea
  - save button
  - loading/success/error notice area
- keep messages high-level and never print env content to console logs or debugging surfaces

## Testing

- add web tests for:
  - env read request + parsing
  - env save request body + parsing
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
  - `curl -fsS http://localhost:8080/api/health`
