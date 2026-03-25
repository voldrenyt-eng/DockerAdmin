# E8-1 Domains CRUD Design

## Scope

Add the first guarded domain-management slice:

- `POST /api/domains`
- `GET /api/domains`
- `DELETE /api/domains/:id`

This slice is intentionally narrow. It persists basic domain bindings in PostgreSQL and exposes them through the existing admin bearer auth flow. It does not start FQDN validation, duplicate-host checks, service existence checks, or Traefik dynamic file generation.

## Contract

The shared package now exposes:

- `DomainCreateRequestSchema`
- `DomainListSchema`

`POST /api/domains` accepts:

```json
{
  "projectId": "project_1",
  "serviceName": "api",
  "host": "app.example.com",
  "port": 8080,
  "tlsEnabled": true
}
```

The response shape is the existing `DomainDto`. `GET /api/domains` returns a bare `DomainDto[]`. `DELETE /api/domains/:id` returns `204`.

## Service behavior

- create checks that the target project exists and returns standardized `404` when it does not
- list returns the current DB snapshot in deterministic repository order
- delete returns standardized `404` when the binding id is missing

Project existence is enforced in this slice because the route otherwise falls through to a raw DB foreign-key failure. Service existence is deferred to `E8-2`.

## Storage and wiring

- add a dedicated domain repository with in-memory and Prisma implementations
- wire a small domain service into `buildApp` and `src/index.ts`
- keep the route layer aligned with existing Fastify slices: shared DTO parse, existing `requireAdminAuth`, standardized errors only

## Out of scope

- FQDN validation
- duplicate host conflict handling
- service existence verification
- Traefik route file generation
- SSL resolver wiring

## Verification

Minimum verification for this slice:

- shared DTO tests cover create/list contracts
- API endpoint tests cover `401`, create success, list success, missing project `404`, delete success, and missing binding `404`
- service tests cover project existence enforcement and delete semantics
