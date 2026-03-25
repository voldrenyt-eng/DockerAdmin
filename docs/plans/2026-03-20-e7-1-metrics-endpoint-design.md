# E7-1 — Metrics endpoint

## Goal

Add a guarded HTTP endpoint that returns basic runtime metrics for the services of one project without failing the whole response when some container stats are unavailable.

## Scope

- add `GET /api/metrics?projectId=`
- reuse the existing admin bearer auth
- return the existing shared metrics DTO list
- resolve project runtime through `project.slug`
- tolerate stopped containers or per-container stats failures

## Out of scope

- no metrics polling in the web app yet
- no historical metrics storage
- no broader normalization/documentation work beyond the current shared DTO
- no domains or notifications work

## Design

### Contract

- query:
  - `projectId` required
- response:
  - `MetricsDto[]`
  - each item contains:
    - `serviceName`
    - `cpuPercent`
    - `memoryUsageBytes`
    - `memoryLimitBytes`
    - `networkRxBytes`
    - `networkTxBytes`

### Execution flow

1. require existing admin bearer auth
2. validate `projectId`
3. load the project by id
4. list project runtime services through `docker compose -p <slug> ps -a`
5. for each service:
   - if it is not `running`, return zero metrics
   - if it is `running`, call `docker stats --no-stream --format "{{ json . }}" <containerName>`
6. parse Docker stats strings into numeric bytes and percentages
7. if one container stats call fails or returns malformed output, zero-fill only that service and keep the overall endpoint successful

### Safety

- missing project returns standardized `404`
- auth is identical to the rest of the protected runtime endpoints
- whole-project runtime lookup failures still return a safe standardized `500`
- per-container stats failures do not leak Docker stderr and do not fail the whole request

## Testing

- route returns metrics for an authenticated admin
- missing `projectId` returns `422`
- missing bearer token returns `401`
- missing project returns `404`
- runtime reader parses Docker stats output into numeric metrics
- stopped or stats-failing services are zero-filled instead of failing the endpoint
