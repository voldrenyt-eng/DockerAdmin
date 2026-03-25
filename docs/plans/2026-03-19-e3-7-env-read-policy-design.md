# E3-7 Env read policy

## Scope

- add guarded `GET /api/projects/:id/env`
- allow only authenticated `ADMIN` access
- decrypt `env.enc` and return the original content for the existing admin editor flow
- keep errors standardized and secret-safe

## Decisions

- MVP read policy is `ADMIN only`
- the response shape is JSON `{ content }` so the same payload can be edited and written back
- missing `env.enc` returns standardized `404`
- unreadable or corrupted encrypted payloads return standardized `500` without exposing secret data
- no masking is applied in MVP because the caller is the authenticated admin editing the full file

## Out Of Scope

- non-admin read access
- partial field reveal
- env diff/history endpoints
- deploy integration

## Tests

- admin can read back the same content after a successful `PUT`
- unauthenticated requests return standardized `401`
- missing env content returns standardized `404`
- corrupted encrypted payloads return standardized `500` without leaking plaintext
