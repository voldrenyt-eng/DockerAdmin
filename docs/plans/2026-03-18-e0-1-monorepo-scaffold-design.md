# E0-1 Monorepo Scaffold Design

## Goal
Create the smallest runnable monorepo baseline that unblocks the rest of the MVP path.

## Chosen approach
- `pnpm` workspace at the repo root
- `turbo` for shared task orchestration
- strict TypeScript config shared across packages
- `apps/api` as a Fastify placeholder
- `apps/web` as a React + Vite placeholder
- `packages/shared` as an empty but typed baseline package for later DTO work

## Why this approach
- It satisfies the `E0-1` acceptance criteria without dragging in DB, auth, or Docker work.
- It matches the architecture document, so later issues build on the same app boundaries.
- It keeps future `E1` and `E2` changes local instead of forcing another repo reshape.

## Explicit non-goals
- No Prisma schema
- No auth endpoints
- No env bootstrap enforcement
- No Docker platform compose
- No real project-management UI
