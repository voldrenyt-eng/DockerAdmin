# E4-3 Deploy endpoint (recreate)

## Scope

- add `POST /api/projects/:id/deploy`
- reuse `E4-2` preflight before any runtime process starts
- persist one `Deployment` record for each manual deploy
- execute `docker compose -p <slug> up -d --build` in the active working source directory
- write deploy command output into `deploy/last-deploy.log` with secret redaction

## Decisions

- deploy is implemented as a synchronous HTTP route for MVP
- the route returns the final `DeploymentDto` after the command exits
- deployment persistence lives behind a dedicated repository with in-memory and Prisma-backed variants
- when `env.enc` exists, deploy decrypts it in memory and merges variables into the child process environment
- deploy never writes plaintext `.env` files to disk
- deploy logs are written to the project runtime path and redact known secret values before persistence
- the API runtime now includes Docker CLI and mounts `/var/run/docker.sock` so the container can control Docker on the host

## Out Of Scope

- deploy locking
- deploy timeout handling
- deployment list/history endpoints
- audit log integration
- service/domain orchestration beyond `docker compose up -d --build`

## Tests

- route returns `SUCCESS` and writes a redacted deploy log on a successful command
- route returns `FAILED` and persists the deployment result when `docker compose` exits non-zero
- missing project returns standardized `404`
- missing bearer token returns standardized `401`
- live Docker smoke proves `login -> create project -> put env -> upload zip -> deploy`
- live Docker smoke confirms env variables reach the deployed container and `last-deploy.log` does not leak the secret
