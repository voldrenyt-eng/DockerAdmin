# E0-2 Docker Packaging Design

## Goal
Wrap the current scaffold into one deployable Docker stack that can be started on any Linux server with Docker Compose.

## Chosen approach
- one `infra/docker-compose.platform.yml`
- local `build:` contexts for `api` and `web`
- `postgres` with a named volume
- `traefik` with `file provider`, aligned with the MVP architecture
- DEV-only dashboard bound to `127.0.0.1:8080`

## Why this approach
- It satisfies the user's deployment requirement without introducing registry, CI, or multi-compose complexity.
- It keeps the architecture aligned with later domain-routing work, because Traefik already runs through a file provider.
- It leaves auth, DB schema, and deploy engine out of scope for later P0 issues.

## Explicit non-goals
- no app auth
- no Prisma migrations
- no production secret management
- no CI image publishing
- no multi-server deployment
