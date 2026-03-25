# E1-1 Shared DTO Baseline Design

## Goal
Create one shared DTO baseline for API and Web without pulling in full domain implementation.

## Chosen approach
- `packages/shared` exports Zod schemas for:
  - `ApiError`
  - `Auth`
  - `Project`
  - `Deployment`
  - `Domain`
  - `Service`
  - `Metrics`
- API imports these schemas directly from the workspace package
- a small `contracts` route set proves request and response validation through shared DTOs

## Why this approach
- It satisfies `E1-1` without pretending that auth or project CRUD is already implemented.
- It gives the next backend and frontend slices one source of truth for payload shapes.
- It keeps the proof surface small and testable.

## Explicit non-goals
- no real auth logic
- no database-backed project endpoints
- no full error-contract middleware yet
