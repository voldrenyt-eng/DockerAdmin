# DockerAdmin MVP

Monorepo scaffold for the DockerAdmin MVP.

## Workspace layout

- `apps/api` — Fastify API baseline with shared DTOs, standardized errors, and Prisma schema
- `apps/web` — React + Vite SPA placeholder with modular i18n catalogs
- `packages/shared` — baseline shared package reserved for cross-app DTOs
- `docs` — MVP scope, issues, status, and design notes

## Commands

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm test:api`
- `pnpm typecheck`
- `pnpm docker:platform:config`
- `pnpm docker:platform:up`
- `pnpm docker:platform:down`

## Required env

Create `.env` from `.env.example` and provide at least:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ENV_ENCRYPTION_KEY`

Docker commands in this repo read the root `.env` explicitly via `--env-file .env`.

Optional for runtime storage:

- `DATA_ROOT`
- `DEPLOY_TIMEOUT_MS`
- `WEB_ORIGIN`

Local/default behavior:

- local dev resolves `DATA_ROOT=data` to `<repo>/data`
- deploy timeout defaults to `300000` ms and can be lowered for smoke tests
- API CORS defaults to `WEB_ORIGIN=http://localhost:5173` for Vite dev and otherwise relies on same-origin browser access through Traefik
- Docker runtime uses a dedicated volume mounted at `/app/data`

## Database baseline

`E2-1` adds Prisma schema and the initial migration under `apps/api/prisma`.

Use:

- `pnpm db:generate` to generate the Prisma client from the committed schema
- `pnpm db:migrate` to apply committed migrations to the local Docker PostgreSQL service
- `pnpm db:seed` to create the admin user from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`

The current migration flow is intentionally narrow:

- schema lives in `apps/api/prisma/schema.prisma`
- committed SQL lives in `apps/api/prisma/migrations`
- `pnpm db:migrate` starts `postgres` if needed and applies migrations through the API image on the Docker network
- `pnpm db:seed` starts `postgres` if needed and runs the seed through the API image on the Docker network

For `E2-2`, password hashing uses Node `crypto.scrypt` with a self-describing stored hash format.

## Auth baseline

The current API baseline now includes:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/me`

Transport is intentionally narrow for MVP:

- `login`, `refresh`, and `logout` accept JSON bodies
- `me` expects `Authorization: Bearer <accessToken>`
- refresh tokens are opaque, rotated on refresh, revoked on logout, and stored hashed in PostgreSQL
- protected runtime routes use a reusable Fastify auth guard
- external `/api/*` paths are preserved by Traefik and forwarded to the API as-is

## Projects baseline

The current project metadata slice now includes:

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`

Current behavior is intentionally narrow for MVP:

- all project routes require the existing admin bearer auth
- `name` is trimmed and validated as `3..80`
- `sourceType` is limited to `zip | git`
- `slug` is generated on create, validated against a compose-safe contract, and kept stable on rename
- slug collisions are resolved with a numeric suffix
- the current slice creates the initial runtime layout for each project under `data/projects/{id}`

## Runtime storage baseline

The current runtime storage layer now provides one shared helper module for:

- `data/projects/{projectId}`
- `src/`
- `repo/`
- `deploy/`
- `env.enc`
- `deploy/last-deploy.log`

Current behavior is intentionally narrow:

- path resolution is guarded against escaping the configured data root
- `POST /api/projects` creates `project root + src + repo + deploy`
- `env.enc` is now used by the env storage/read slice, while `last-deploy.log` remains a path helper until deploy work starts
- `env.enc` is now used by the env storage/read slice, and `last-deploy.log` is now used by the deploy execution slice
- Docker persists runtime data in a dedicated `runtime-data` volume mounted into the API container

## Env baseline

The current env management slice now includes:

- `PUT /api/projects/:id/env`
- `GET /api/projects/:id/env`

Current behavior is intentionally narrow for MVP:

- both routes require the existing admin bearer auth
- writes accept a JSON body `{ "content": "..." }`, and reads return the same shape
- blank lines and `# ...` comments are allowed, while non-comment lines must use `KEY=VALUE`
- project env content is encrypted at rest into `data/projects/{id}/env.enc` using `AES-256-GCM`
- plaintext `.env` files are never written to disk
- `GET` returns the full decrypted content to `ADMIN` only, and missing env state returns a standardized `404`
- decrypt or storage failures do not echo secret values through API errors or logs

## ZIP source baseline

The current source ingestion slice now includes:

- `POST /api/projects/:id/source/zip`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- the API accepts raw `application/zip` and `application/octet-stream` bodies
- safe archives are extracted into `data/projects/{id}/src`
- path traversal, symlink, and special files are blocked
- upload size and extracted size are capped and return readable standardized errors
- repeated ZIP upload atomically replaces the existing `src/` workspace
- if the new extract fails, the previous working `src/` workspace is preserved

## Git source baseline

The current source ingestion slice now also includes:

- `POST /api/projects/:id/source/git`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- the API accepts a JSON body with public `https://` `url` and optional `branch`
- clone runs as `git clone --depth 1` without submodules
- when `branch` is omitted, Git uses the remote default branch
- the repository is cloned into `data/projects/{id}/repo`
- repeated Git clone atomically replaces the existing `repo/` workspace
- if the new clone or promotion fails, the previous working `repo/` workspace is preserved
- clone timeout and git/runtime failures return readable standardized errors

## Compose validation baseline

The current deploy-prep slice now includes one helper module for:

- resolving the active working source directory from `project.sourceType`
- locating exactly one compose file in the source root

Current behavior is intentionally narrow for MVP:

- ZIP projects resolve to `data/projects/{id}/src`
- Git projects resolve to `data/projects/{id}/repo`
- only root-level files are considered
- supported names are limited to:
  - `docker-compose.yml`
  - `docker-compose.yaml`
  - `compose.yml`
  - `compose.yaml`
- missing compose files return a readable `Compose file not found` validation error
- multiple root compose files return a readable ambiguity error

## Deploy preflight baseline

The current deploy-prep slice now also includes one standalone preflight service for:

- loading the project before deploy
- asserting the active working source directory exists
- reusing compose resolution from the `E4-1` helper
- checking Docker daemon availability
- checking whether encrypted env state is present and decryptable

Current behavior is intentionally narrow for MVP:

- project absence returns standardized `404`
- missing working source returns standardized `404`
- missing or ambiguous compose files preserve the readable validation errors from `E4-1`
- Docker daemon failures are normalized into a controlled `500` with a safe message
- if `env.enc` is absent, preflight still passes with `hasEncryptedEnv=false`
- if `env.enc` exists but cannot be decrypted, preflight fails before any deploy process starts

## Deploy execution baseline

The current deploy execution slice now includes:

- `POST /api/projects/:id/deploy`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- deploy reuses the `E4-2` preflight context before any process starts
- the API creates a `Deployment` record and transitions it from `RUNNING` to `SUCCESS` or `FAILED`
- deploy writes `DEPLOY_START` and `DEPLOY_FINISH` entries into `AuditLog`
- audit messages stay high-level and never include `stdout`, `stderr`, raw exceptions, env values, or other secrets
- audit persistence is best-effort and does not change the deploy result
- only one deploy per project may run at a time, and a concurrent second request returns standardized `409 CONFLICT`
- deploy runs `docker compose -p <project-slug> up -d --build` in the active working source directory
- if `env.enc` exists, decrypted env variables are passed to the `docker compose` process in memory only
- plaintext `.env` files are never written to disk during deploy
- command `stdout/stderr` is persisted into `data/projects/{id}/deploy/last-deploy.log`
- deploy log writing redacts known secret values before they reach disk
- deploy timeout is configurable through `DEPLOY_TIMEOUT_MS`, and a timed-out deploy is terminated and stored as `FAILED`
- after the persisted final deploy status is known, the API sends a plain Telegram notification with `SUCCESS|FAILED`, `project slug`, and `deployment id` when the notifier is configured
- if Telegram is not configured or delivery fails, deploy still returns the final result and only a safe warning is emitted
- the API image now bundles Docker CLI and mounts `/var/run/docker.sock` for the runtime deploy command

## Deploy history baseline

The current deployment history slice now also includes:

- `GET /api/projects/:id/deployments`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- project absence returns standardized `404`
- the response is a bare `DeploymentDto[]`
- history is returned newest-first by `startedAt`
- existing deployment DTO fields are reused without extra filters, pagination, or detail expansion

## Services baseline

The current services slice now also includes:

- `GET /api/projects/:id/services`
- `POST /api/services/:serviceId/action`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- project absence and stale services return standardized `404`
- list responses are a bare `ServiceDto[]`
- service inventory is resolved live from Docker by `project.slug` via `docker compose -p <slug> ps -a`
- each listed service now includes an opaque `serviceId`
- service actions accept only `{ action: "start" | "stop" | "restart" }`
- the action route reuses the verified `serviceId` mapping and returns the refreshed `ServiceDto`
- only the requested project runtime is queried; arbitrary container lookup stays out of scope
- `startedAt` is hydrated from container inspect when available, otherwise `null`
- when the project has no runtime containers yet, the endpoint returns `[]`
- Docker daemon or CLI failures return a safe standardized `500`
- successful and failed actions write a safe best-effort `SERVICE_ACTION` audit record

## Domains baseline

The current domains slice now also includes:

- `POST /api/domains`
- `GET /api/domains`
- `DELETE /api/domains/:id`

Current behavior is intentionally narrow for MVP:

- all routes require the existing admin bearer auth
- `POST` accepts `{ projectId, serviceName, host, port, tlsEnabled }`
- `POST` persists one domain binding and returns the created `DomainDto`
- `GET` returns a bare `DomainDto[]`
- `DELETE` removes one existing binding and returns `204`
- `host` must be a valid normalized FQDN
- `port` must be an integer in the range `1..65535`
- duplicate `host` values now return standardized `409 CONFLICT`
- the target `serviceName` must exist in the live project runtime resolved through `project.slug`
- missing projects during create return standardized `404`
- missing runtime services during create return standardized `404`
- missing domain bindings during delete return standardized `404`
- successful create/delete now regenerate `infra/traefik/dynamic/routes.yml` from the full DB snapshot
- routes are written through a temp file + atomic rename and keep the base `api` / `web` routers in the same file
- generated domain services currently target `http://host.docker.internal:<port>` through the stored binding port
- `tlsEnabled=true` now adds `tls.certResolver: letsencrypt` to the generated domain router
- Traefik ACME `http-01` is enabled through a generated static config at container startup
- `TRAEFIK_ACME_STAGING=true` is the default DEV path, while `false` switches to the production Let's Encrypt CA

## Logs baseline

The current logs slice now also includes:

- `GET /api/projects/:id/logs?serviceName=&tail=`
- `WS /api/ws/logs?projectId=&serviceName=&tail=&accessToken=`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- `serviceName` is required and must belong to the requested project runtime
- `tail` is optional and defaults to `200`
- the response is `{ serviceName, tail, lines }`
- log lookup is resolved through `project.slug` via `docker compose -p <slug> logs --tail <n> --no-color <serviceName>`
- the endpoint returns only the requested service logs, not whole-project aggregation
- missing projects or stale services return standardized `404`
- Docker daemon or CLI failures return a safe standardized `500`
- the WebSocket variant uses a browser-compatible `accessToken` query param during handshake because browser clients cannot set arbitrary `Authorization` headers for WS upgrades
- missing or invalid WS access tokens are rejected before upgrade with standardized `401`
- the first WS frame is `{ type: "snapshot", serviceName, tail, lines }`
- follow output is streamed as `{ type: "line", serviceName, line }`
- follow failures return one safe `{ type: "error", message }` frame and then close the socket
- large queued WS bursts return one safe `{ type: "error", message: "Log stream overloaded" }` frame and then close the socket
- client disconnect only stops that service log follower and does not affect the HTTP logs route
- app shutdown destroys active log sockets before server close completes, so an in-flight WS stream does not block API shutdown

## Metrics baseline

The current metrics slice now also includes:

- `GET /api/metrics?projectId=`

Current behavior is intentionally narrow for MVP:

- the route requires the existing admin bearer auth
- `projectId` is required
- the response is a bare `MetricsDto[]`
- items are sorted by `serviceName` ascending for a stable API order
- project runtime services are resolved through `project.slug`
- running services use `docker stats --no-stream --format "{{ json . }}" <containerName>`
- `cpuPercent` is a non-negative percentage value rounded to 2 decimal places
- `memoryUsageBytes`, `memoryLimitBytes`, `networkRxBytes`, and `networkTxBytes` are returned as non-negative integer byte counts
- stopped services return zero metrics
- if one container stats lookup fails or returns malformed output, only that service is zero-filled and the endpoint still succeeds
- if an individual stats fragment cannot be parsed into a numeric value, that metric is normalized to `0`
- missing projects return standardized `404`
- whole-project runtime lookup failures return a safe standardized `500`
- the placeholder web app now includes a local metrics card that stores `projectId` and `accessToken` in browser storage and polls the endpoint roughly every 5 seconds
- the web metrics card shows loading and error states and stops polling when the page unmounts
- when the SPA runs through Vite dev on `http://localhost:5173`, metrics requests target `http://localhost:3001`; otherwise the current origin is used

Optional for the current bootstrap:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `DEPLOY_TIMEOUT_MS`
- `WEB_ORIGIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `TRAEFIK_DASHBOARD_PORT`
- `TRAEFIK_ACME_EMAIL`
- `TRAEFIK_ACME_STAGING`

## Docker packaging

`E0-2` packages the current scaffold into one deployable Docker stack:

- `web` image served by `nginx`
- `api` image running the built Fastify placeholder
- `postgres` with a persistent named volume
- `traefik` with file-provider routes

Use:

- `pnpm docker:platform:config` to validate the compose file
- `pnpm docker:platform:up` to build and start the stack
- `pnpm docker:platform:down` to stop it

The Traefik dashboard is mapped to `127.0.0.1:18080` by default for DEV-only access and should not be exposed publicly.
The app image build requires access to Docker Hub for `node:24-alpine` and `nginx:1.27-alpine`, or an equivalent local registry/cache.

## Web i18n baseline

The current web baseline supports modular locale catalogs under:

- `apps/web/src/lang/en`
- `apps/web/src/lang/uk`
- `apps/web/src/lang/ru`

Each module or page keeps its own translation file instead of one global dictionary. The first slice includes:

- `common.ts`
- `app.ts`
- `settings.ts`

The active locale is selected in the settings card, stored in `localStorage`, and falls back to `en` for unsupported values.

## Scope of this scaffold

The current baseline now includes monorepo bootstrap, Docker packaging, shared DTOs, standardized API errors, Prisma schema/migrations, admin seed flow, auth runtime endpoints, a reusable minimal auth guard, guarded project metadata CRUD, the initial runtime storage layout, encrypted env storage/read policy, ZIP source ingestion, public Git source ingestion, atomic source workspace replacement, compose file validation helpers for deploy preflight, a standalone deploy preflight service, a synchronous deploy execution endpoint, per-project deploy locking, deploy timeout handling, deployment history listing, deploy audit logging, deploy-linked Telegram notifications, runtime service listing, service lifecycle controls, validated domains CRUD with collision checks, generated Traefik routes from the domain DB snapshot, ACME `http-01` wiring with a DEV staging toggle, project service logs over both HTTP fallback and narrow WS streaming, and the basic metrics endpoint.
It still does not add full web UI flows.
