# E4-7 Deploy audit integration

## Scope

- write audit records for deploy start and deploy finish
- keep deploy runtime semantics unchanged
- attach audit records to the acting user and project when available
- store only safe deploy outcome reasons without secret leakage
- reuse the existing `AuditLog` Prisma model

## Decisions

- deploy audit is implemented behind a dedicated repository, not inline Prisma calls from routes
- the deploy service owns audit writes because it already controls deployment creation and final result mapping
- manual deploy now receives `userId` from the guarded HTTP route and passes it into the deploy service
- `DEPLOY_START` is written after the `Deployment` record is created, using `entityType="deployment"` and `entityId=<deployment.id>`
- `DEPLOY_FINISH` is always attempted after a persisted deploy result, with safe messages only:
  - `Deploy finished successfully`
  - `Deploy failed: timed out`
  - `Deploy failed: command exited non-zero`
  - `Deploy failed: internal error`
- audit writes never include deploy stdout/stderr, env content, raw exception messages, or secret values
- audit failure must not change the deploy result in this slice

## Out Of Scope

- audit read endpoints
- audit writes for auth, project, source, env, or service flows
- storing raw deploy output in audit
- distributed audit/event bus infrastructure

## Tests

- successful deploy writes `DEPLOY_START` and `DEPLOY_FINISH` with the acting user and project
- timed-out deploy writes a safe `DEPLOY_FINISH` reason without leaking collected command output
- non-zero deploy writes the safe non-zero finish reason
- missing project or missing bearer token does not create deploy audit side effects
