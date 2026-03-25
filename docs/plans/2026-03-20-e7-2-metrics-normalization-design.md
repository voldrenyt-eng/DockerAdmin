# E7-2 — Metrics normalization

## Goal

Stabilize the existing `GET /api/metrics?projectId=` contract so the frontend can poll it without compensating for Docker-specific ordering or numeric formatting drift.

## Scope

- keep the existing guarded metrics endpoint and shared `MetricsDto[]` shape
- document the normalization rules for CPU, memory, and network values
- return metrics in a deterministic order for the same runtime snapshot

## Out of scope

- no frontend polling in this slice
- no new DTO fields, pagination, or historical metrics
- no domains, Traefik, or notification work

## Design

### Contract rules

- response remains a bare `MetricsDto[]`
- items are sorted by `serviceName` ascending before the API returns them
- `cpuPercent` is a non-negative percentage value rounded to 2 decimal places
- `memoryUsageBytes`, `memoryLimitBytes`, `networkRxBytes`, and `networkTxBytes` are non-negative integer byte counts

### Runtime normalization

- Docker `stats` strings continue to be parsed from `--format "{{ json . }}"`
- decimal units (`kB`, `MB`, `GB`, ...) and binary units (`KiB`, `MiB`, `GiB`, ...) are both converted into bytes
- stopped services still return a full zero-filled metrics object
- if one service stats call fails or the overall stats line is malformed, only that service is zero-filled
- if one numeric fragment inside an otherwise valid stats record is unparseable, that specific metric falls back to `0`

### Where the guarantees live

- runtime reader keeps unit conversion and CPU rounding
- metrics service applies final deterministic sorting by `serviceName`
- shared DTO stays unchanged because the field set was already adequate in `E7-1`

## Testing

- add a runtime test that proves fractional CPU values are rounded and mixed decimal/binary units are normalized into bytes
- add a service test that proves output order is stable by `serviceName`
- keep the full API suite green after the change
