# E4-1 Compose validation (presence + parse)

## Scope

- resolve the active working source directory from the project `sourceType`
- look for exactly one supported compose filename in the root of that working source
- return canonical `workingDir`, `composeFileName`, and `composeFilePath`
- fail with readable standardized validation errors when no supported file exists or more than one exists

## Decisions

- ZIP projects use `data/projects/{id}/src` as the working source
- Git projects use `data/projects/{id}/repo` as the working source
- only root-level files count; nested `docker-compose.yml` files are ignored
- supported filenames are fixed to:
  - `docker-compose.yml`
  - `docker-compose.yaml`
  - `compose.yml`
  - `compose.yaml`
- `E4-1` stops at deterministic file resolution; Docker daemon checks and deploy execution remain later slices

## Out Of Scope

- Docker daemon availability
- env decrypt readiness
- `docker compose config`
- deploy execution
- deployment persistence and logging

## Tests

- ZIP projects resolve to the `src` workspace
- Git projects resolve to the `repo` workspace
- one supported root compose file resolves successfully
- nested compose files do not satisfy the root requirement
- multiple root compose files return a readable ambiguity error
