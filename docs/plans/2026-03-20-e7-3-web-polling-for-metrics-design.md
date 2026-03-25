# E7-3 — Web polling for metrics

## Goal

Add a minimal frontend flow that polls the existing guarded metrics endpoint and exposes the results in the placeholder web app without waiting for the future auth or projects UI.

## Scope

- add a metrics card to the placeholder `apps/web` shell
- store one `projectId` and one admin `accessToken` in browser storage for local MVP testing
- poll the metrics endpoint roughly every 5 seconds
- show loading and error state in the UI

## Out of scope

- no login flow, token minting UI, or project picker
- no charts, history, alerts, or advanced dashboard widgets
- no backend or shared DTO changes

## Design

### UI shape

- keep the current placeholder shell and add one `Live metrics` card
- the card contains:
  - `projectId` input
  - `accessToken` input
  - loading/error status text
  - `last updated` timestamp
  - a simple table rendering the returned `MetricsDto[]`

### Polling flow

- the browser persists `projectId` and `accessToken` in `localStorage`
- once both values are present, the card starts one immediate fetch and then repeats about every 5 seconds
- the polling controller aborts in-flight work and clears the interval on unmount so the page does not keep background work alive after cleanup

### Runtime URL policy

- in Docker / same-origin runtime, requests use the current origin
- in Vite dev on `http://localhost:5173`, requests target `http://localhost:3001`
- this keeps the slice usable in both `pnpm dev` and the rebuilt Docker stack without adding broader env/config work yet

## Testing

- add web tests for:
  - stored metrics session read/write helpers
  - metrics API base URL resolution
  - immediate fetch + interval scheduling
  - abort + interval cleanup on stop
  - shared API error propagation
- keep web lint/typecheck/build green
