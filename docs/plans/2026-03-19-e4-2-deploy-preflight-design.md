# E4-2 Deploy preflight checks

## Scope

- load the project before deploy
- assert the active working source directory exists
- reuse `E4-1` compose file resolution
- check Docker daemon availability before deploy start
- verify env decrypt readiness without returning plaintext secrets

## Decisions

- preflight is implemented as a standalone service, not an HTTP route
- the service returns a normalized context with:
  - `projectId`
  - `projectSlug`
  - `sourceType`
  - `workingDir`
  - `composeFileName`
  - `composeFilePath`
  - `hasEncryptedEnv`
- missing `env.enc` does not fail preflight in MVP
- existing `env.enc` must be decryptable or preflight fails before deploy begins
- Docker daemon reachability is checked via a narrow injectable runner, with a default `docker info` implementation

## Out Of Scope

- `POST /api/projects/:id/deploy`
- deployment persistence
- deploy locking
- deploy timeout handling
- deploy log writing

## Tests

- valid preflight returns normalized context for a project with compose + decryptable env
- missing project returns standardized `404`
- missing working source returns standardized `404`
- missing compose file preserves the readable `E4-1` validation error
- Docker daemon failures return a controlled `500`
- corrupted `env.enc` fails safely before deploy start
