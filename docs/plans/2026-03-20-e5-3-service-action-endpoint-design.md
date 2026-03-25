# E5-3 — Service action endpoint

## Goal

Add a guarded API endpoint so an admin can run narrow Docker service actions against a verified project service.

## Scope

- add `POST /api/services/:serviceId/action`
- support only `start`, `stop`, and `restart`
- reuse the existing verified `serviceId -> project.slug + serviceName` resolution
- return the refreshed `ServiceDto`
- write safe best-effort `SERVICE_ACTION` audit records

## Out of scope

- no logs streaming or log tailing yet
- no metrics
- no batch or bulk service actions
- no web UI wiring in this slice

## Design

### Request and response

- request body is `{ action }`
- `action` is constrained to `start | stop | restart`
- response reuses `ServiceDto`
- service payloads now include opaque `serviceId` values so the action route is callable through the API without exposing raw container ids

### Execution flow

1. require existing admin bearer auth
2. validate `serviceId` path param and `{ action }` body
3. resolve the target service through the existing `serviceId` verification flow
4. run `docker compose -p <projectSlug> <action> <serviceName>`
5. list the runtime again and return the refreshed matching service

### Safety and audit

- callers never provide arbitrary Docker container ids
- `serviceId` stays project-bound through `projectId + serviceName`
- malformed, stale, or cross-project `serviceId` values return standardized `404`
- Docker command failures return a safe standardized `500`
- audit writes use one safe `SERVICE_ACTION` record with high-level success or failure text only
- audit persistence remains best-effort and must not change runtime outcomes

## Testing

- route accepts only authenticated requests
- route validates only `start | stop | restart`
- service layer resolves the target, executes the Docker action, relists runtime, and returns the refreshed service
- Docker command runner builds the expected `docker compose` invocation
- success and failure paths both write safe audit records
