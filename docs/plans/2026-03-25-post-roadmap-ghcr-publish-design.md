# Post-roadmap — GHCR image publishing

## Goal

Extend the existing manual release workflow so every approved release also publishes versioned Docker images for `api` and `web` to GitHub Container Registry.

## Scope

- extend the existing manual GitHub Actions release workflow in:
  - `.github/workflows/release.yml`
- publish two immutable versioned images to GHCR:
  - `ghcr.io/<owner>/dockeradmin-api:vX.Y.Z`
  - `ghcr.io/<owner>/dockeradmin-web:vX.Y.Z`
- keep using the existing Dockerfiles:
  - `apps/api/Dockerfile`
  - `apps/web/Dockerfile`
- authenticate to GHCR with the default `GITHUB_TOKEN`
- add repo-local logic to normalize the repository owner and construct canonical image references
- add tests for workflow permissions, GHCR login, build/push steps, and image naming

## Out of scope

- no mutable `latest` tags
- no prerelease channels
- no Docker Hub or other registries
- no changes to local compose-based development flow
- no deploy automation
- no runtime consumption of published images in `infra/docker-compose.platform.yml`

## Design

### Release architecture

- keep one release entrypoint by extending `.github/workflows/release.yml`
- do not introduce a second publish workflow in this batch
- keep the current release workflow responsibilities:
  - verify repository health
  - synchronize workspace versions
  - create release commit and tag
  - open a draft GitHub Release
- add one new responsibility:
  - publish versioned GHCR images for `api` and `web`

This keeps release metadata and release artifacts in one manual flow while avoiding any deploy coupling.

### Image naming

- publish only immutable version tags:
  - `vX.Y.Z`
- image names:
  - `ghcr.io/<lowercased-owner>/dockeradmin-api:vX.Y.Z`
  - `ghcr.io/<lowercased-owner>/dockeradmin-web:vX.Y.Z`
- normalize `github.repository_owner` to lower-case before constructing image refs
- do not publish SHA aliases or mutable tags in this batch

### Workflow permissions and steps

- extend workflow permissions with:
  - `packages: write`
- keep existing verification gates before any remote side effects
- after verification and version synchronization:
  1. commit the version bump
  2. create tag `vX.Y.Z`
  3. authenticate to GHCR
  4. build and push `api` image
  5. build and push `web` image
  6. push release commit and tag
  7. create draft GitHub Release

### Failure semantics

- publish images before `git push`
- if GHCR login or image build/push fails:
  - no release commit is pushed
  - no release tag is pushed
  - no draft GitHub Release is created
- this improves the current release workflow by ensuring remote release side effects happen only after registry artifacts exist

### Repo-local helper

- add a small Node helper script:
  - `scripts/release-images.mjs`
- the script owns:
  - repository owner lower-case normalization
  - canonical `api` and `web` GHCR reference construction
  - strict use of the version tag only
- keep the workflow YAML focused on orchestration rather than string-building logic

### Dockerfiles and compose

- do not change:
  - `apps/api/Dockerfile`
  - `apps/web/Dockerfile`
  - `infra/docker-compose.platform.yml`
- local development and local Docker smoke continue to use `build:` from the repo checkout
- published GHCR images are release artifacts only in this batch

## Testing

- extend `scripts/release-workflow.test.mjs` to verify:
  - `packages: write` permission exists
  - GHCR login step exists
  - separate `api` and `web` build/push steps exist
  - image publish happens before `git push`
  - draft GitHub Release creation still happens after push
- add `scripts/release-images.test.mjs` to verify:
  - owner normalization to lower-case
  - canonical API image ref output
  - canonical web image ref output
  - version tag only semantics

## Verification

- `node --test scripts/ci-workflow.test.mjs scripts/release-workflow.test.mjs scripts/release-version.test.mjs scripts/release-images.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost`

## Notes for follow-up

- a later batch can switch deploy/runtime flows to consume published versioned images
- a later batch can decide whether mutable tags such as `latest` are acceptable
- a later batch can split release and publish into separate workflows if scale or failure isolation warrants it
