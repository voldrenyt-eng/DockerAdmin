# E3-1 Projects CRUD (metadata)

## Scope

- Add guarded metadata CRUD for projects:
  - `POST /api/projects`
  - `GET /api/projects`
  - `GET /api/projects/:id`
  - `PATCH /api/projects/:id`
- Reuse shared DTOs from `packages/shared`
- Persist only metadata in `projects`

## Decisions

- `name` is trimmed and validated as `3..80`
- `sourceType` is limited to `zip | git`
- `slug` is generated on create from `name`
- slug collisions are resolved with a numeric suffix
- slug stays stable on rename in `E3-1`
- all project routes require existing admin auth guard

## Out Of Scope

- runtime directories
- source upload/clone flows
- env management
- deployments
- audit log writes
- pagination/filtering
- slug policy hardening beyond basic uniqueness

## Tests

- shared DTO coverage for create/update/list project contracts
- API route coverage for auth, validation, create/list/get/update
- service coverage for slug collision suffix and slug immutability
