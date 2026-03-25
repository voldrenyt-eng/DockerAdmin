# E6-1 — Logs HTTP fallback

## Goal

Add a guarded HTTP endpoint that returns the last log lines for one verified project service.

## Scope

- add `GET /api/projects/:id/logs?serviceName=&tail=`
- require one `serviceName`
- default `tail` to `200`
- verify the requested service belongs to the project runtime resolved by `project.slug`
- return a narrow response object with the requested service name, effective tail, and log lines

## Out of scope

- no WebSocket streaming yet
- no multi-service or whole-project log aggregation
- no persisted log history beyond Docker's current runtime output
- no UI wiring in this slice

## Design

### Request and response

- path param: `projectId`
- query params:
  - `serviceName` required
  - `tail` optional, positive integer, default `200`
- response shape:
  - `serviceName`
  - `tail`
  - `lines`

### Execution flow

1. require existing admin bearer auth
2. validate `projectId`, `serviceName`, and `tail`
3. load the project by id
4. list runtime services through `project.slug`
5. verify `serviceName` belongs to that runtime
6. run `docker compose -p <projectSlug> logs --tail <tail> --no-color <serviceName>`
7. split stdout into response lines and return them

### Safety

- callers cannot read logs through arbitrary container ids
- service access is project-bound through `project.id -> project.slug -> serviceName`
- missing project returns standardized `404`
- service absent from the project runtime returns standardized `404`
- Docker daemon and CLI failures stay behind a safe standardized `500`

## Testing

- route requires auth
- missing `serviceName` returns `422`
- omitted `tail` uses the default value
- service lookup is verified against the project runtime before Docker logs execution
- Docker logs runner builds the expected `docker compose logs` command
- Docker failures return a safe generic error
