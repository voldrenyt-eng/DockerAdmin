# E2-2 — Seed Admin User Design

## Goal
- додати `pnpm db:seed` для створення admin user з `SEED_ADMIN_EMAIL` і `SEED_ADMIN_PASSWORD`
- зробити seed idempotent: якщо user already exists, дубль не створюється
- зафіксувати password hashing choice для наступного `E2-3`

## Chosen approach
- password hashing uses Node `crypto.scrypt`
- hash format is stored in one string field with an algorithm prefix and parameters
- seed script lives in `apps/api/prisma/seed.ts`
- root `pnpm db:seed` runs the seed through the API image on the Docker network, same style as `pnpm db:migrate`

## Why `scrypt`
- secure memory-hard password hashing for MVP
- no extra native dependency surface beyond Node core
- avoids early Docker/runtime complexity from `argon2`
- reusable in `E2-3` login password verification

## In scope
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` env contract
- password hash / verify helper
- Prisma-backed admin seed script
- root and API seed commands
- docs/status update

## Out of scope
- auth endpoints
- refresh token flow
- audit writes
- password reset
- broader user management

## Verification
- failing tests first for password helper and seed script surface
- `pnpm test:api`
- `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... pnpm db:seed`
- second `pnpm db:seed` stays idempotent
- DB check proves one admin user exists and `password_hash` is not plaintext
