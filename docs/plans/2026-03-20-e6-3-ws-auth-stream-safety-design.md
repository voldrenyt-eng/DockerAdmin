# E6-3 — WS auth + stream safety

## Goal

Harden the existing project log WebSocket stream so it enforces access token validation, stays bounded during heavy log bursts, and cleans up followers reliably on disconnect and app shutdown.

## Scope

- keep `WS /api/ws/logs?projectId=&serviceName=&tail=&accessToken=` as the MVP handshake contract
- reject missing or invalid access tokens before upgrade
- bound queued outbound WS log frames so one slow or bursty stream cannot grow memory without limit
- stop the Docker log follower on client disconnect and during app shutdown
- keep failure messaging safe and high-level

## Out of scope

- no switch to cookie auth or a custom WS subprotocol in this slice
- no log sampling, compression, or rate limiting beyond bounded buffering
- no UI changes
- no metrics work yet

## Design

### Auth policy

- browser clients keep using `accessToken` in the query string because they cannot send arbitrary `Authorization` headers during a standard WS upgrade
- missing token returns standardized `401 Authentication required`
- malformed, expired, or unknown token returns standardized `401 Invalid or expired access token`

### Stream safety

- outbound WS messages are queued as encoded frames instead of writing every log line blindly
- the queue is bounded by a small fixed byte budget
- if one burst exceeds that budget, the stream is terminated with one safe `{ type: "error", message: "Log stream overloaded" }` frame and then closed
- live follow failures still use the existing safe `{ type: "error", message: "Log stream failed" }` frame and then close
- benign socket reset errors are ignored in logs to avoid noisy shutdown/disconnect traces

### Cleanup

1. disconnect or close frame stops the Docker follower
2. Fastify `preClose` destroys any upgraded WS sockets before server shutdown waits on them
3. per-socket close/error handlers stop the follower and release in-memory buffers

## Testing

- invalid token is rejected with standardized `401`
- a large synchronous burst of log lines returns the safe overload error and closes the socket
- live follow failure still returns the safe failure error and closes the socket
- `app.close()` with an active WS stream closes the socket and stops the follower
