# E4-6 Deployments list/history

## Scope

- add guarded `GET /api/projects/:id/deployments`
- return deployment history for one project as `DeploymentDto[]`
- reuse the existing `Deployment` persistence model and current deployment DTO shape
- keep the response ordered newest-first
- stay out of audit integration, pagination, and service control flows

## Decisions

- the route uses the existing admin bearer auth guard
- the MVP response is a bare `DeploymentDto[]`, not a wrapped object, to keep the slice narrow
- ordering is defined by `startedAt desc` through the existing deployment repository contract
- project existence is still validated before returning history, so an unknown project yields standardized `404`
- no new deployment status, filter model, or query parameters are added in this slice
- the route is read-only and does not touch deploy logs, runtime state, or lock state

## Out Of Scope

- pagination, cursoring, or filtering
- deployment detail endpoint by deployment id
- deploy logs/history enrichment
- audit log integration
- background polling helpers or web UI

## Tests

- authenticated `GET /api/projects/:id/deployments` returns newest-first `DeploymentDto[]`
- route returns an empty array for an existing project with no deployments
- missing project returns standardized `404`
- missing bearer token returns standardized `401`
- shared contract parses deployment history arrays without local API-only schema drift
