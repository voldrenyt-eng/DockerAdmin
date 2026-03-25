# E12-2 — Build validation

## Goal

Extend the existing pull-request CI so API and Web builds are validated explicitly instead of relying on typecheck alone.

## Scope

- keep the existing `pull_request` workflow
- add a separate CI job for build validation
- make the build job run only after the existing checks job succeeds
- validate the workspace build through the existing root `pnpm build` command

## Out of scope

- no Docker or compose smoke in this batch
- no release, publish, or deploy automation
- no workflow matrix split by package
- no extra caching strategy beyond the current Node/pnpm setup

## Design

### Workflow shape

- keep one workflow file at `.github/workflows/ci.yml`
- preserve the current `checks` job for `lint`, `typecheck`, and tests
- add one separate `build` job with `needs: checks`
- keep build status isolated so CI output shows clearly whether a failure happened in checks or in build

### Build execution

- reuse the same baseline setup as the checks job:
  - `actions/checkout@v4`
  - `pnpm/action-setup@v4` with `10.6.0`
  - `actions/setup-node@v4` with `node-version: 24` and `cache: pnpm`
  - `pnpm install --frozen-lockfile`
- run `pnpm build` in the build job
- rely on the existing root `turbo run build` command so CI validates `shared`, `api`, and `web` consistently with local development

## Testing

- extend the existing workflow contract test first so it requires:
  - a separate `build` job
  - `needs: checks`
  - `pnpm build`
- rerun that test red before updating the workflow
- rerun it green after the workflow change

## Verification

- `node --test scripts/ci-workflow.test.mjs`
- `pnpm build`
