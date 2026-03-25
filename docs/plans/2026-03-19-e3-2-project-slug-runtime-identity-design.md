# E3-2 Project slug / runtime identity

## Scope

- centralize slug generation into one canonical module
- expose compose-safe slug validation through the shared DTO layer
- keep slug immutable after project creation

## Decisions

- slug remains internal-only and is never user-editable in MVP
- slug policy follows Docker Compose project name constraints
- generator uses a strict lowercase `a-z0-9-` subset, which remains valid for Compose
- empty or non-ASCII-only names fall back to `project`
- collisions append numeric suffixes like `-2`, `-3`

## Out Of Scope

- manual slug override
- transliteration beyond basic Unicode normalization
- migrations/backfills for existing rows
- deploy/runtime binding logic

## Tests

- shared slug schema coverage
- slug generator coverage for punctuation, accents, fallback, and collisions
- existing project service tests continue to prove uniqueness and rename immutability
