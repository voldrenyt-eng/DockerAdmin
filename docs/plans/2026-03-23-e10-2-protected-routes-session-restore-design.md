# E10-2 — Protected routes + session restore

## Goal

Add real URL-based auth routing to `apps/web` so the login screen lives at `/login`, the dashboard lives behind a protected `/`, and the browser restores the MVP auth session across reloads without routing through a manual token screen.

## Scope

- add `react-router-dom` to the web app
- make `/login` the public route for the existing sign-in screen
- make `/` the protected route for the existing dashboard shell
- redirect unauthenticated access to protected routes back to `/login`
- redirect authenticated access to `/login` back to `/`
- keep session restore local-storage-first by reusing the stored shared `AuthDto`
- navigate to `/login` on logout and on refresh failure after a guarded `401`

## Out of scope

- no `GET /api/me` bootstrap validation on initial load
- no multi-page projects UI yet
- no route tree for `/projects`, `/logs`, `/deployments`, or `/settings` yet
- no backend auth contract changes

## Design

### Routing shape

- use `BrowserRouter` at the web entrypoint
- keep the current UI shell but split it into route-level screens:
  - `/login` -> login screen
  - `/` -> protected dashboard shell
- add one public-only boundary for `/login`
- add one auth-required boundary for `/`
- unknown routes redirect to `/` when a local session exists, otherwise to `/login`

### Session model

- continue storing the full shared `AuthDto` in `localStorage`
- read that stored session on startup and use it as the route guard source of truth
- reload on `/` with a stored session stays inside the dashboard
- logout always clears the local session and then navigates to `/login`
- refresh failure during guarded runtime calls clears the local session, sets the existing session-expired message, and navigates to `/login`

### UI impact

- preserve the current login design and dashboard shell
- move the auth boundary from an inline `if (!authSession)` branch to route-level wrappers
- keep the existing portal look and current placeholder dashboard structure

## Testing

- add web tests for route/auth redirect decisions
- add web tests for `/login -> /` when a session exists
- add web tests for protected dashboard access redirecting to `/login` without a session
- keep auth helper tests and metrics refresh tests green
- verify the batch with:
  - `pnpm --filter @dockeradmin/web test`
  - `pnpm --filter @dockeradmin/web lint`
  - `pnpm --filter @dockeradmin/web typecheck`
  - `pnpm --filter @dockeradmin/web build`
  - `curl -fsS http://localhost/api/health`
