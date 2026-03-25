# E0-4 Environment Bootstrap Design

## Goal
Add one API env schema that fails fast when critical configuration is missing.

## Chosen approach
- one `apps/api/src/config.ts` module using `zod`
- startup validation before `app.listen()`
- root `.env.example` for documented required values
- local `.env` for dev and Docker smoke, ignored by git

## Why this approach
- It satisfies the issue without pulling in Prisma or auth implementation early.
- It keeps the env contract in one place and makes startup failures explicit.
- It preserves local and Docker workflows with the same required variable names.

## Explicit non-goals
- no DB connection logic
- no JWT runtime implementation
- no encryption service yet
