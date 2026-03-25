# Post-roadmap — Deploy-linked release automation

## Goal

Extend the manual release workflow so it can optionally roll out the newly published DockerAdmin runtime images to one server over SSH, while keeping pure release publishing available as a separate manual path.

## Scope

- extend `.github/workflows/release.yml`
- add one explicit manual release input:
  - `deploy_runtime`
- keep the current release path for:
  - verification
  - workspace version sync
  - GHCR image publishing
  - release commit and tag push
- add an optional SSH-based runtime rollout path that:
  - checks out the released tag on the target server
  - validates `infra/docker-compose.runtime.yml`
  - pulls the released `api` and `web` images
  - runs `docker compose ... up -d`
- gate draft GitHub Release creation on the deploy result when runtime rollout is requested

## Out of scope

- no self-hosted GitHub runner
- no multi-server rollout
- no rollback automation
- no mutation of the server `.env`
- no changes to user project deploy orchestration in `apps/api/src/deploy/service.ts`
- no runtime secret management beyond GitHub Actions secrets

## Design

### Release and deploy architecture

- keep one release entrypoint:
  - `.github/workflows/release.yml`
- add one manual input:
  - `deploy_runtime`
- release behavior:
  - when `deploy_runtime=false`, workflow behaves like the current publish-only release flow
  - when `deploy_runtime=true`, workflow performs a server rollout after successful GHCR publish and git push
- rollout affects only the DockerAdmin platform runtime via:
  - `infra/docker-compose.runtime.yml`

### SSH contract

- required GitHub Actions secrets:
  - `DEPLOY_RUNTIME_SSH_HOST`
  - `DEPLOY_RUNTIME_SSH_PORT`
  - `DEPLOY_RUNTIME_SSH_USER`
  - `DEPLOY_RUNTIME_SSH_PRIVATE_KEY`
  - `DEPLOY_RUNTIME_SSH_KNOWN_HOSTS`
  - `DEPLOY_RUNTIME_APP_DIR`
- the target server is assumed to already contain:
  - a checkout of this repository at `DEPLOY_RUNTIME_APP_DIR`
  - a working `.env` for the runtime stack
  - Docker and Docker Compose available on the host
- workflow must use pinned `known_hosts` from secrets
- workflow must not use `ssh-keyscan`

### Remote rollout sequence

- remote commands run in `DEPLOY_RUNTIME_APP_DIR`
- sequence:
  1. `git fetch --tags origin`
  2. `git checkout vX.Y.Z`
  3. `GHCR_OWNER=<owner> IMAGE_TAG=vX.Y.Z docker compose --env-file .env -f infra/docker-compose.runtime.yml config`
  4. `GHCR_OWNER=<owner> IMAGE_TAG=vX.Y.Z docker compose --env-file .env -f infra/docker-compose.runtime.yml pull api web`
  5. `GHCR_OWNER=<owner> IMAGE_TAG=vX.Y.Z docker compose --env-file .env -f infra/docker-compose.runtime.yml up -d`
- workflow must not run `git pull` on a branch
- workflow must not rewrite the server `.env`

### Job graph

- split the release workflow into three logical jobs:
  - `release`
  - `deploy_runtime`
  - `draft_release`
- `release` job:
  - runs the existing verify/version/publish/push path
  - exposes outputs:
    - normalized image owner
    - `version_tag`
- `deploy_runtime` job:
  - `needs: release`
  - runs only when `deploy_runtime=true`
  - configures SSH credentials
  - executes the remote rollout sequence
- `draft_release` job:
  - when `deploy_runtime=false`, runs after `release`
  - when `deploy_runtime=true`, runs only after successful `deploy_runtime`

### Failure semantics

- if `deploy_runtime=false`:
  - behavior matches the current release path
- if `deploy_runtime=true` and SSH rollout fails:
  - workflow fails loudly
  - release commit and tag may already be pushed
  - GHCR images already exist
  - draft GitHub Release must not be created
- this is acceptable for the first deploy-linked rollout batch because release artifacts remain reproducible and the operator can retry or roll back manually

## Testing

- extend `scripts/release-workflow.test.mjs` to verify:
  - `deploy_runtime` input exists
  - a gated SSH deploy job exists
  - deploy job uses `infra/docker-compose.runtime.yml`
  - deploy job uses pinned `known_hosts`
  - deploy flow checks out `vX.Y.Z` by tag
  - draft release creation remains after deploy when deploy is requested
- keep existing release workflow and helper tests green

## Verification

- `node --test scripts/ci-workflow.test.mjs scripts/release-workflow.test.mjs scripts/release-version.test.mjs scripts/release-images.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`

## Notes for follow-up

- a later batch can add rollback or redeploy-by-tag automation
- a later batch can replace SSH with a self-hosted runner if that proves operationally simpler
- a later batch can validate the remote runtime path with a live staging server instead of workflow-shape tests only
