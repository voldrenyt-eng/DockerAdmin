# E8-2 Domain Validation & Collision Checks Design

## Scope

Tighten the guarded domains CRUD slice with the missing validation and safety checks from MVP:

- normalize and validate `host` as a real FQDN
- constrain `port` to integer `1..65535`
- reject duplicate `host` bindings with standardized `409`
- reject bindings to runtime services that do not exist for the target project

This slice keeps the existing CRUD surface from `E8-1`. It does not start Traefik dynamic file generation or SSL resolver wiring.

## Contract

The shared package keeps the same public DTO shapes:

- `DomainCreateRequestSchema`
- `DomainListSchema`

`POST /api/domains` still accepts:

```json
{
  "projectId": "project_1",
  "serviceName": "api",
  "host": "App.Example.com",
  "port": 8080,
  "tlsEnabled": true
}
```

Behavior changes:

- `host` is trimmed, lowercased, and rejected unless it is a valid FQDN
- `projectId` and `serviceName` are trimmed non-empty strings
- `port` is rejected unless it is an integer in `1..65535`
- duplicate `host` now returns standardized `409`
- missing runtime `serviceName` now returns standardized `404`

The response shape remains the existing `DomainDto`.

## Service behavior

- create still checks that the target project exists and returns standardized `404` when it does not
- create now checks for an existing domain with the same normalized `host` before insert
- create now verifies `serviceName` against the live Docker runtime resolved through `project.slug`
- list and delete behavior stay unchanged from `E8-1`

Runtime service verification stays intentionally narrow: the service must exist in the current compose runtime for the project, but no Traefik config is generated yet.

## Storage and wiring

- reuse the existing domain repository and add `findDomainByHost`
- reuse the existing project runtime service lister instead of adding a second Docker resolution path
- keep the route layer aligned with existing Fastify slices: shared DTO parse, existing `requireAdminAuth`, standardized errors only

## Out of scope

- Traefik route file generation
- SSL resolver wiring
- wildcard domains or broader hostname policy beyond MVP-safe FQDN validation
- frontend domains UI

## Verification

Minimum verification for this slice:

- shared DTO tests cover host normalization, FQDN validation, and port bounds
- API endpoint tests cover invalid host `422`, invalid port `422`, duplicate host `409`, and missing runtime service `404`
- service tests cover duplicate-host rejection and runtime service verification through `project.slug`
