# E11-3 — Security headers + CORS baseline

## Goal

Add a narrow API hardening baseline so every HTTP response carries basic security headers and browser CORS access is limited to one configured web origin.

## Scope

- add baseline security headers for API responses
- add one configured `WEB_ORIGIN` setting to API config
- allow CORS only for that exact origin
- support browser preflight requests for existing JSON API routes
- document the policy and env setting

## Out of scope

- no CSP rollout
- no HSTS on local HTTP
- no WebSocket origin restrictions in this batch
- no multi-origin allowlist
- no frontend routing or proxy changes

## Design

### Security headers

- set a minimal header set on every API response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()`
- keep the set intentionally small and deterministic for MVP
- skip `Content-Security-Policy` because this service returns JSON/API responses, not HTML pages
- skip `Strict-Transport-Security` because local dev still runs over plain `http://`

### CORS policy

- add `WEB_ORIGIN` to API config with default `http://localhost:5173`
- normalize the configured value down to `URL.origin`
- only echo `Access-Control-Allow-Origin` when `Origin === WEB_ORIGIN`
- do not emit wildcard CORS headers
- same-origin Docker/Traefik runtime continues to work because it does not rely on CORS

### Preflight behavior

- handle browser `OPTIONS` preflight centrally before route matching
- for allowed origin:
  - return `204`
  - set `Access-Control-Allow-Origin`
  - set `Access-Control-Allow-Methods`
  - echo `Access-Control-Allow-Headers` from `Access-Control-Request-Headers` when present
  - set `Vary: Origin, Access-Control-Request-Headers`
- for disallowed origin:
  - return standardized `403 FORBIDDEN`
  - do not emit allow headers

### Wiring

- keep implementation dependency-free with Fastify hooks instead of adding a new CORS package
- pass `config.webOrigin` from `index.ts` into `buildApp`
- expose `WEB_ORIGIN` in:
  - `apps/api/src/config.ts`
  - `infra/docker-compose.platform.yml`
  - `.env.example`
  - `README.md`

## Testing

- add failing config tests first for:
  - default `WEB_ORIGIN`
  - custom `WEB_ORIGIN` normalization
- add server tests for:
  - security headers on normal responses
  - allowed origin receives `Access-Control-Allow-Origin`
  - disallowed origin does not
  - allowed preflight returns `204` with allow headers
  - disallowed preflight returns standardized `403`

## Verification

- `pnpm --filter @dockeradmin/api test`
- `pnpm --filter @dockeradmin/api lint`
- `pnpm --filter @dockeradmin/api typecheck`
- `pnpm --filter @dockeradmin/api build`
- `pnpm docker:platform:up`
- `curl -fsS http://localhost/api/health`
- `curl -fsS http://localhost:8080/api/health`
- `curl -i -H 'Origin: http://localhost:5173' http://localhost/api/health`
