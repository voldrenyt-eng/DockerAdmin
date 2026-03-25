# E4-4 Deploy locking

## Scope

- prevent two deploy executions from running at the same time for one project
- return standardized `409 CONFLICT` for the second concurrent deploy
- guarantee lock release after `SUCCESS` and `FAILED`
- keep timeout-specific release semantics deferred to `E4-5`

## Decisions

- locking is implemented inside the deploy service, not in the HTTP route
- the MVP lock is an in-memory project-id set scoped to the API process
- preflight still runs before lock acquisition; the lock guards deployment record creation and command execution
- lock release is handled by an outer `finally` so it also covers deployment record failures and log-write failures

## Out Of Scope

- distributed locking across multiple API replicas
- deploy timeout handling
- deployment history endpoints
- audit integration

## Tests

- second concurrent deploy for the same project returns `409 CONFLICT`
- lock is released after a successful deploy and the next deploy can start
- lock is released after a failed deploy and the next deploy can start
- live Docker smoke confirms `first=SUCCESS` and `second=409 CONFLICT` for the same project on the rebuilt stack
