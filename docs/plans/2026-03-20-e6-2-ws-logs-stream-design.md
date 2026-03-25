# E6-2 — WS logs stream

## Goal

Add a narrow WebSocket endpoint that sends an initial log snapshot for one verified project service and then follows live Docker log output.

## Scope

- add `WS /api/ws/logs?projectId=&serviceName=&tail=&accessToken=`
- require one `projectId`, one `serviceName`, and a valid admin access token during the handshake
- default `tail` to `200`
- send one snapshot frame first, then one frame per followed log line
- stop the Docker log follower when the client disconnects

## Out of scope

- no multi-service or whole-project log multiplexing
- no persisted log history beyond Docker's current runtime output
- no new WebSocket dependency; keep the implementation on Node's existing HTTP upgrade flow
- no stream backpressure or rate limiting policy beyond safe cleanup in this slice
- no UI wiring in this slice

## Design

### Handshake and message contract

- path: `/api/ws/logs`
- query params:
  - `projectId` required
  - `serviceName` required
  - `tail` optional, positive integer, default `200`
  - `accessToken` required
- outbound message union:
  - snapshot: `{ type: "snapshot", serviceName, tail, lines }`
  - line: `{ type: "line", serviceName, line }`
  - error: `{ type: "error", message }`

### Execution flow

1. parse and validate the query string before upgrading
2. verify the provided access token through the existing auth service
3. load the project by id
4. list runtime services through `project.slug`
5. verify `serviceName` belongs to that runtime
6. read the initial `tail` snapshot through the existing HTTP logs reader
7. upgrade the connection and send the snapshot frame
8. start `docker compose -p <projectSlug> logs --tail 0 --follow --no-color <serviceName>`
9. stream each parsed stdout line as one `line` frame until disconnect or process failure

### Safety

- callers still cannot read logs through arbitrary container ids; service access stays project-bound through `project.id -> project.slug -> serviceName`
- unauthorized or malformed handshakes are rejected before upgrade with standardized `401` or `422`
- browser clients use `accessToken` in the query because they cannot set arbitrary `Authorization` headers for WS upgrades
- follow failures send one safe error frame and then close the socket without leaking raw Docker stderr
- client disconnect stops only that follower, and app shutdown destroys any remaining upgraded sockets

## Testing

- successful handshake sends the snapshot frame first and then followed line frames
- missing or invalid token is rejected with standardized `401`
- missing required query fields returns `422` before upgrade
- service lookup is verified against the project runtime before the stream starts
- Docker follow failures return a safe error frame and close the socket
- disconnect triggers follower cleanup and does not hang the API test process
