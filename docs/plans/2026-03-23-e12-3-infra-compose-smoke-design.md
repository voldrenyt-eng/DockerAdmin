# E12-3 — Infra / compose smoke

## Goal

Add one narrow infra smoke stage to pull-request CI so platform compose and Prisma setup failures surface before merge.

## Scope

- extend the existing `pull_request` workflow with an `infra-smoke` job
- validate Docker compose rendering for the platform stack
- validate Prisma schema explicitly
- validate Prisma client generation
- validate the migration path through the existing root migrate command

## Out of scope

- no full `docker:platform:up` runtime smoke in CI
- no HTTP health checks from CI in this batch
- no release, publish, or deploy automation
- no Docker image push or registry login

## Design

### Workflow shape

- keep the existing `checks` and `build` jobs unchanged
- add one separate `infra-smoke` job with `needs: build`
- keep infra failures isolated from lint/test/build failures

### CI env bootstrap

- the current root compose and Prisma scripts read `.env`
- GitHub runners do not have the local untracked `.env`, so the workflow must bootstrap one explicitly
- create `.env` from `.env.example` inside the job before running compose or Prisma commands
- the example values are sufficient for CI smoke because this batch only validates config/render/generate/migrate behavior

### Smoke sequence

- run `pnpm docker:platform:config`
- run `pnpm db:validate`
- run `pnpm db:generate`
- run `pnpm db:migrate`
- reuse existing root scripts so CI stays aligned with the documented local workflow

## Testing

- extend the workflow contract test first so it requires:
  - an `infra-smoke` job
  - `needs: build`
  - env bootstrap from `.env.example`
  - `docker:platform:config`
  - `db:validate`
  - `db:generate`
  - `db:migrate`
- rerun that test red before updating the workflow
- rerun it green after the workflow change

## Verification

- `node --test scripts/ci-workflow.test.mjs`
- `pnpm docker:platform:config`
- `pnpm db:validate`
- `pnpm db:generate`
- `pnpm db:migrate`
