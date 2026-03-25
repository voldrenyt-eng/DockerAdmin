# E2-3 Auth Endpoints Design

## Scope

Implement only the MVP auth runtime endpoints:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/me`

Keep the slice narrow:

- use JSON request bodies for `login`, `refresh`, and `logout`
- use `Authorization: Bearer <accessToken>` for `GET /api/me`
- keep the existing standardized API error contract
- do not add rate limiting, cookie transport, global auth guards, or web login UI in this issue

## Token strategy

### Recommended option

- access token: signed JWT-like bearer token with embedded user claims and expiry
- refresh token: opaque random token returned to the client and stored server-side in hashed form

This option is the best fit for the current MVP baseline because:

- it matches the accepted API contract for returning `accessToken + refreshToken`
- it supports rotation and logout invalidation cleanly
- it avoids cookie/CORS/CSRF scope
- it uses the existing `RefreshToken` Prisma model directly

### Alternatives rejected

- JWT refresh token: makes targeted revoke/rotation harder and adds avoidable auth complexity
- HttpOnly cookie transport: valid later, but expands transport and browser policy scope beyond `E2-3`

## Data flow

### Login

1. validate body through shared DTO
2. find user by email
3. verify password with the existing `scrypt` helper
4. issue access token
5. issue opaque refresh token
6. hash refresh token and store it with expiry
7. return `{ tokens, user }`

### Refresh

1. validate body through shared DTO
2. hash the provided refresh token
3. find an active refresh token row
4. reject missing, revoked, or expired tokens with standardized `401`
5. revoke the current refresh row
6. issue a new access token and a new refresh token
7. store the new hashed refresh token
8. return `{ tokens, user }`

### Logout

1. validate body through shared DTO
2. hash the provided refresh token
3. find an active refresh token row
4. reject missing, revoked, or expired tokens with standardized `401`
5. revoke the current refresh row
6. return `204 No Content`

### Me

1. read `Authorization: Bearer <accessToken>`
2. verify signature, token type, and expiry
3. load the current user from persistence
4. return the shared auth user DTO

## Persistence boundary

Auth runtime uses the existing Prisma `RefreshToken` model and stores refresh tokens hashed at rest.

The implementation should isolate persistence behind a small auth repository so:

- runtime uses Prisma
- tests can use an in-memory repository

## Error handling

Keep the existing standardized error payload:

- invalid body -> `422 VALIDATION_ERROR`
- invalid credentials -> `401 UNAUTHORIZED`
- invalid, revoked, malformed, or expired tokens -> `401 UNAUTHORIZED`
- missing bearer token -> `401 UNAUTHORIZED`

Never log passwords, raw access tokens, or raw refresh tokens.

## Deferred

Explicitly out of scope for `E2-3`:

- rate limiting
- cookie-based transport
- CSRF handling
- Web UI login flow
- global auth guard abstraction
- RBAC beyond `ADMIN`
- audit log writes
- configurable TTL env vars
