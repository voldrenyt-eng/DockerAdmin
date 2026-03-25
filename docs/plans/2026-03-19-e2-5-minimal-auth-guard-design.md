# E2-5 Minimal Auth Guard Design

## Scope

Implement a reusable minimal auth guard for protected API routes.

This slice is intentionally narrow:

- keep public endpoints public:
  - `GET /health`
  - `GET /api/health`
  - `POST /api/auth/*`
  - `/api/contracts/*`
- protect real runtime endpoints through one reusable guard
- start by converting `GET /api/me` to use the guard

## Recommended approach

Use a Fastify `preHandler` helper created from the existing auth service.

Why this option:

- avoids repeating bearer-token parsing inside each protected route
- gives one reusable guard for the next MVP routes such as `/api/projects/*`
- keeps public and protected route boundaries explicit per route
- avoids a global allowlist hook that is easier to break accidentally

## Behavior

### Guard responsibilities

The guard:

- reads `Authorization: Bearer <accessToken>`
- validates the access token through `authService.getCurrentUser()`
- stores the current user on the Fastify request object
- enforces `ADMIN only` for the MVP

### Error contract

Keep the existing standardized error payload:

- missing bearer token -> `401 UNAUTHORIZED`
- malformed or expired bearer token -> `401 UNAUTHORIZED`
- non-admin user -> `403 FORBIDDEN`

## Implementation notes

- add a dedicated auth guard module
- extend Fastify request typing with `currentUser`
- remove inline access-token handling from `GET /api/me`
- apply the guard via route-level `preHandler`

## Deferred

Explicitly out of scope:

- global auth hook
- websocket logs auth
- projects/deploy business routes
- rate limiting
- RBAC beyond `ADMIN`
