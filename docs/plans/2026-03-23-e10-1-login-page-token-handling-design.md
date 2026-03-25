# E10-1 — Login page + token handling

## Goal

Add a real MVP login flow to `apps/web` that uses the existing backend auth contract and lets the placeholder dashboard work without manual token copying.

## Scope

- show a dedicated login screen until the browser has a saved auth session
- submit credentials to the existing `POST /api/auth/login` endpoint
- persist the shared `AuthDto` payload in browser storage for the MVP shell
- use the stored access token for guarded metrics calls
- refresh the access token through `POST /api/auth/refresh` after a guarded `401`
- let logout call `POST /api/auth/logout` and still clear the local auth session even if the API request fails

## Out of scope

- no React router or protected route tree yet
- no `GET /api/me` restore handshake on app boot
- no cookie session, SSR auth, or backend contract changes
- no projects CRUD, detail pages, or broader dashboard navigation flows

## Design

### UI shape

- keep the existing single-page web shell in `App.tsx`
- when there is no saved auth session, render a localized split login screen instead of the dashboard
- after login succeeds, switch back to the existing dashboard shell and reuse the current topbar/sidebar layout

### Storage policy

- store the full shared `AuthDto` payload under one browser `localStorage` key
- restore that payload on app boot so a reload keeps the MVP session without extra user work
- clear only the auth session on logout; keep other browser-scoped preferences such as locale or selected `projectId`

### Auth flow

1. submit email/password through the shared login DTO helper
2. on success, save the returned `AuthDto` and clear the password field
3. guarded metrics polling sends `Authorization: Bearer <accessToken>`
4. if metrics returns `401`, call refresh with the current refresh token
5. if refresh succeeds, replace the stored session and retry the guarded request once
6. if refresh fails, clear the local auth session, stop the guarded flow, and return the user to login with a session-expired message
7. logout is best-effort against the API, but local session cleanup is unconditional

### Runtime URL policy

- reuse the existing frontend API base URL rule:
  - `http://localhost:3001` during Vite dev on port `5173`
  - current origin in Docker / same-origin runtime

## Testing

- keep unit coverage for storage helpers and auth request helpers in `apps/web/src/auth.test.ts`
- keep token-refresh retry coverage in `apps/web/src/metrics.test.ts`
- verify the batch with `pnpm --filter @dockeradmin/web lint`
- verify the batch with `pnpm --filter @dockeradmin/web test`
- verify the batch with `pnpm --filter @dockeradmin/web typecheck`
- verify the batch with `pnpm --filter @dockeradmin/web build`
