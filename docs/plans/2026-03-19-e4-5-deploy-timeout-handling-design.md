# E4-5 Deploy timeout handling

## Scope

- add configurable deploy timeout through `DEPLOY_TIMEOUT_MS`
- terminate a hung deploy process in a controlled way
- mark timed-out deployments as `FAILED`
- preserve partial command output in `deploy/last-deploy.log`
- keep timeout cleanup compatible with the existing per-project deploy lock

## Decisions

- deploy timeout is configured once in API config and injected into the deploy service
- the default timeout stays `300000` ms for MVP, with override support from environment
- the deploy runner first sends `SIGTERM` and then escalates to `SIGKILL` after a short grace period if the process ignores termination
- timeout appends a readable `Deploy timed out after <ms>ms` message to `stderr`
- timed-out deploys still write the collected `stdout/stderr` into `deploy/last-deploy.log`
- timeout result is normalized into the existing `SUCCESS | FAILED` deployment state model without adding a new status
- lock release stays in the outer deploy-service `finally`, so timeout does not strand the per-project lock

## Out Of Scope

- deployment history/list endpoints
- audit log integration
- async/background deploy orchestration
- distributed timeout/lock coordination across multiple API replicas

## Tests

- config accepts custom `DEPLOY_TIMEOUT_MS` and keeps the default when omitted
- deploy route passes the configured timeout into the command runner
- timed-out deploy returns `FAILED` and persists partial command output plus the timeout message
- deploy lock is released after timeout so the next deploy can start
- low-level deploy runner terminates a non-cooperative process and returns within bounded time
