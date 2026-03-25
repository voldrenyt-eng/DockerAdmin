# E8-3 Generate Traefik routes.yml from DB Design

## Scope

Add the first derived Traefik routing slice for domains:

- regenerate `infra/traefik/dynamic/routes.yml` after successful `POST /api/domains`
- regenerate the same file after successful `DELETE /api/domains/:id`
- always render the file from the full DB snapshot, not incremental append/remove logic
- write through a temp file and finish with atomic rename

This slice keeps SSL/TLS wiring out of scope. `tlsEnabled` remains persisted in the DB but does not yet change the generated routers.

## Routing policy

The generated file keeps the bootstrap platform routers:

- `api` for `/api` and `/health`
- `web` for the fallback SPA route

Each domain binding adds:

- one `Host(...)` router on `entryPoints: [web]`
- one service targeting `http://host.docker.internal:<port>`

This is intentionally narrow. The current generator does not inspect compose networks or container DNS. It relies on the stored `port` and a Docker `host-gateway` alias on the Traefik container.

## Storage and wiring

- add a dedicated routes module under `apps/api/src/domains/routes.ts`
- render deterministic YAML from the current `Domain` repository snapshot
- default the output path to `infra/traefik/dynamic/routes.yml`, which works both locally and inside the API container because the dynamic directory is bind-mounted into `/app/infra/traefik/dynamic`
- mount the whole dynamic directory into Traefik, not a single file, so atomic rename remains visible to the file provider
- keep Traefik `watch=true`, so route changes are picked up without container restart

## Service behavior

- domain create still validates project existence, duplicate hosts, and runtime service existence before insert
- after successful create, the API regenerates the full routes snapshot
- after successful delete, the API regenerates the full routes snapshot
- if routes sync throws, the error surfaces as a standardized `500`; this slice does not add DB rollback/compensation logic

## Out of scope

- ACME / TLS resolver wiring
- switching routers based on `tlsEnabled`
- runtime verification that `port` is actually published on the host
- frontend domains UI

## Verification

Minimum verification for this slice:

- routes module tests cover deterministic snapshot rendering
- routes module tests cover temp-file write + atomic rename behavior
- routes module tests cover stale-file replacement from a fresh DB snapshot
- domain service tests cover route sync hooks on create/delete and error surfacing when sync fails
