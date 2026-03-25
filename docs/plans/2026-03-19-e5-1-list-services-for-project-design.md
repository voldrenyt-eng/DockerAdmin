# E5-1 — List services for a project

## Goal

Add guarded `GET /api/projects/:id/services` that returns the live Docker Compose runtime inventory for one project.

## Scope

- use the existing project record and `slug` as the runtime identity
- query Docker through `docker compose -p <slug> ps -a`
- normalize results into the existing shared `ServiceDto` contract
- return only services that belong to the requested project runtime
- keep the response narrow: bare `ServiceDto[]`

## Out of scope

- service actions (`start|stop|restart`)
- stable service ids or action mapping
- logs, metrics, domains, or web UI changes
- audit integration for service actions

## Design

### API shape

- route: `GET /api/projects/:id/services`
- auth: existing admin bearer guard
- success: `200` with `ServiceDto[]`
- missing project: standardized `404`
- missing token: standardized `401`
- runtime failure: safe standardized `500`

### Runtime resolution

- load the project from the repository first
- use `project.slug` as the Docker Compose project name
- execute `docker compose -p <slug> ps -a --format json`
- parse each returned container into:
  - `serviceName`
  - `containerName`
  - `image`
  - `ports`
  - `status`
  - `startedAt`

### Normalization rules

- `running` when the runtime state is `running`
- `stopped` when the runtime state is `exited`, `dead`, or `removing`
- `starting` when the runtime state is `created` or `restarting`
- `unknown` for anything else or malformed state
- `startedAt` is read from container inspect; if unavailable, return `null`
- `ports` are normalized to string entries and may be empty

### Safety

- project scoping is derived from `slug`, not arbitrary container ids
- raw Docker output and inspect payloads are never returned to clients
- runtime lookup failures do not leak CLI stderr details in API responses

## Testing

- authenticated request returns normalized service inventory for the target project
- empty runtime returns `[]`
- missing project returns `404`
- missing token returns `401`
- runtime failure returns safe `500`
