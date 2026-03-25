# E5-2 — Service identity mapping

## Goal

Add an internal service identity foundation so future action endpoints never operate on arbitrary container ids.

## Scope

- introduce an opaque `serviceId` format for internal use
- decode `serviceId` back into `projectId + serviceName`
- verify the referenced service exists in the live runtime resolved by `project.slug`
- expose a narrow resolver for future `start|stop|restart` endpoints

## Out of scope

- no new public API route
- no change to the current `GET /api/projects/:id/services` response shape
- no service actions yet
- no audit changes yet

## Design

### Identity format

- `serviceId` is an opaque base64url payload, not a raw container id
- payload contains:
  - `projectId`
  - `serviceName`

### Verification flow

1. decode `serviceId`
2. load the project by `projectId`
3. use `project.slug` to list the live runtime services
4. verify `serviceName` exists inside that runtime
5. return a verified action target:
   - `serviceId`
   - `projectId`
   - `projectSlug`
   - `serviceName`

### Safety

- callers never provide a Docker container id directly
- a service is considered valid only if it is present in the runtime derived from the project slug
- a service from another project runtime cannot be resolved through a mismatched `serviceId`

## Testing

- opaque `serviceId` round-trips through encode/decode helpers
- malformed ids do not decode
- resolver loads the project and verifies the service against the matching project slug
- missing project returns standardized `404`
- service absent from the project runtime returns standardized `404`
