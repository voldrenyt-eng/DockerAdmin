# E1-2 — Standard Error Contract Design

## Goal
- уніфікувати контрольовані API помилки до одного transport contract:
  - `{ "error": { "code": string, "message": string } }`
- зафіксувати канонічний mapping для `401/403/404/409/422/500`
- не заходити в real auth, DB, або frontend data layer beyond minimal proof of shared contract usage

## Chosen approach
- розширити `packages/shared` canonical error code schema, status map, і parser helper
- додати в API thin `AppError` abstraction та global Fastify error handler
- synthetic contract routes використати тільки як proof surface для mapping tests
- у Web використати shared parser/helper без локального альтернативного error shape

## In scope
- shared:
  - `ApiErrorCodeSchema`
  - status map for standard error codes
  - helper to parse unknown payload into `ApiError`
- api:
  - `AppError`
  - one global error formatter
  - controlled mappings for `401/403/404/409/422/500`
  - standardized not-found handler
- web:
  - import and use shared error parser/helper

## Out of scope
- auth guards
- business/domain exceptions
- prisma/db errors
- generic API client or query layer
- localization/error catalogs

## Verification
- shared tests prove canonical error code/status exports
- api tests prove exact status/code/message mapping for `401/403/404/409/422/500`
- lint, typecheck, build, docker smoke remain green
