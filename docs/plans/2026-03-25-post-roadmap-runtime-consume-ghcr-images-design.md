# Post-roadmap — Runtime consume published GHCR images

## Goal

Add a runtime-oriented Docker Compose path that consumes the versioned `api` and `web` images already published to GitHub Container Registry, while keeping the existing build-based local development flow unchanged.

## Scope

- add a dedicated runtime compose file:
  - `infra/docker-compose.runtime.yml`
- use published versioned app images for:
  - `api`
  - `web`
- keep the current local development compose path unchanged:
  - `infra/docker-compose.platform.yml`
- add explicit env-driven runtime image parameters:
  - `GHCR_OWNER`
  - `IMAGE_TAG`
- add root scripts for runtime compose config/up/down
- document the new runtime path in status/design notes

## Out of scope

- no changes to local build-based `pnpm docker:platform:up`
- no changes to the deploy engine for user projects
- no automated deploy or release-triggered rollout
- no mutable image tags such as `latest`
- no fallback from runtime compose to local builds

## Design

### Runtime architecture

- keep the current local dev stack in:
  - `infra/docker-compose.platform.yml`
- add a new runtime stack in:
  - `infra/docker-compose.runtime.yml`
- the runtime stack keeps the same overall service topology:
  - `traefik`
  - `postgres`
  - `api`
  - `web`
- only `api` and `web` switch from `build:` to `image:`
- `postgres` and `traefik` stay on their current public base images

This creates a clean separation between:
- local development startup from source
- runtime startup from published release artifacts

### Runtime image contract

- runtime compose uses:
  - `ghcr.io/${GHCR_OWNER}/dockeradmin-api:${IMAGE_TAG}`
  - `ghcr.io/${GHCR_OWNER}/dockeradmin-web:${IMAGE_TAG}`
- both env vars are required:
  - `${GHCR_OWNER:?GHCR_OWNER is required}`
  - `${IMAGE_TAG:?IMAGE_TAG is required}`
- `IMAGE_TAG` must be an explicit release tag such as:
  - `v0.2.0`
- no default tag is allowed in this batch

### Local developer flow

- leave existing scripts untouched:
  - `docker:platform:config`
  - `docker:platform:up`
  - `docker:platform:down`
- add new root scripts:
  - `docker:runtime:config`
  - `docker:runtime:up`
  - `docker:runtime:down`
- all runtime scripts continue to read the root `.env`

### Environment documentation

- extend `.env.example` with:
  - `GHCR_OWNER=dockeradminorg`
  - `IMAGE_TAG=v0.2.0`
- examples stay illustrative only; the operator must still provide real values for the target repository owner and release tag

### Failure semantics

- `docker:runtime:config` must fail fast when `GHCR_OWNER` or `IMAGE_TAG` are absent
- `docker:runtime:up` may still fail later if the requested image tag does not exist in GHCR
- this is acceptable for this batch because the goal is runtime image consumption wiring, not deploy orchestration

## Testing

- add a test that verifies root `package.json` exposes:
  - `docker:runtime:config`
  - `docker:runtime:up`
  - `docker:runtime:down`
- add a test that verifies `infra/docker-compose.runtime.yml`:
  - exists
  - uses `image:` for `api` and `web`
  - requires `GHCR_OWNER` and `IMAGE_TAG`
  - does not use `build:` for `api` or `web`
- keep standard repo verification:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm docker:platform:up`
- add runtime config acceptance:
  - `pnpm docker:runtime:config`

## Verification

- `node --test scripts/runtime-compose.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
- `pnpm docker:runtime:config`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`

## Notes for follow-up

- a later batch can switch deploy/runtime operations to consume these published images automatically
- a later batch can define how release tags propagate into actual server rollout
- a later batch can decide whether live runtime smoke with GHCR pulls should become part of CI or release validation
