# E11-4 — Input and upload limits

## Goal

Make request-size limits explicit for the API so generic JSON bodies and ZIP uploads both fail in a controlled, standardized way when callers exceed the allowed payload size.

## Scope

- add one explicit global body-size limit for regular API requests
- preserve the existing route-level ZIP upload size limit
- return standardized `422 VALIDATION_ERROR` responses when either limit is exceeded
- keep the current extracted-size ZIP safety checks unchanged

## Out of scope

- no rate limiting
- no per-endpoint fine-grained limit matrix beyond generic body vs ZIP upload
- no changes to ZIP extracted-size rules or source workspace semantics
- no web UI changes

## Design

### Limit model

- set an explicit global API body limit of `1 MiB` for regular request bodies
- keep the existing ZIP route-specific upload limit at `10 MiB`
- continue using the existing ZIP extracted-size limit of `64 MiB` after upload succeeds

### Error policy

- when a regular request body exceeds the global limit, return standardized:
  - code: `VALIDATION_ERROR`
  - message: `Request body exceeds the maximum allowed size`
- when the ZIP upload route exceeds its route-level body limit, keep the existing standardized message:
  - `ZIP archive exceeds the maximum upload size`
- do not leak parser internals or Fastify error codes into the response

### Wiring

- keep limit handling centralized in `server.ts`
- configure Fastify with the explicit global body limit during app creation
- keep the current ZIP route `bodyLimit` override in place
- branch the existing `FST_ERR_CTP_BODY_TOO_LARGE` error mapping by route so generic requests and ZIP uploads produce the correct message

## Testing

- add a failing test first for a regular oversized JSON body
- keep existing ZIP upload overflow coverage as the regression guard for the route-specific message
- verify that both cases return `422` with the correct standardized messages

## Verification

- `pnpm --filter @dockeradmin/api test`
- `pnpm --filter @dockeradmin/api lint`
- `pnpm --filter @dockeradmin/api typecheck`
- `pnpm --filter @dockeradmin/api build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost:8080/api/health`
