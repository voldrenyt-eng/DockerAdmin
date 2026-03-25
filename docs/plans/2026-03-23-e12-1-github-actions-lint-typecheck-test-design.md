# E12-1 — GitHub Actions: lint/typecheck/test

## Goal

Add one narrow CI pipeline for pull requests so every PR is blocked by the existing lint, typecheck, and test checks.

## Scope

- add a GitHub Actions workflow for `pull_request`
- install workspace dependencies with the pinned `pnpm` version already used by the repo
- run root `lint`
- run root `typecheck`
- run package tests for `shared`, `api`, and `web`

## Out of scope

- no build job in this batch
- no Docker or compose smoke in CI yet
- no release, publish, or deploy automation
- no caching or matrix optimization beyond the standard Node/pnpm setup

## Design

### Trigger and shape

- create one workflow at `.github/workflows/ci.yml`
- trigger only on `pull_request`
- keep a single `checks` job for this batch so the pipeline is easy to read and debug

### Runtime setup

- use `ubuntu-latest`
- use `actions/checkout@v4`
- use `pnpm/action-setup@v4` pinned to `10.6.0`
- use `actions/setup-node@v4` with `node-version: 24` and `cache: pnpm`
- install with `pnpm install --frozen-lockfile`

### Check sequence

- run `pnpm lint`
- run `pnpm typecheck`
- run `pnpm --filter @dockeradmin/shared test`
- run `pnpm --filter @dockeradmin/api test`
- run `pnpm --filter @dockeradmin/web test`
- keep `build` out of this workflow so `E12-2` stays a separate batch

## Testing

- add a failing file-content test first that asserts the workflow exists and includes the required trigger and commands
- rerun that test after adding the workflow until it passes

## Verification

- `node --test scripts/ci-workflow.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
