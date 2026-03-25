# E0-3 Runtime storage layout

## Scope

- add one runtime path module for `data/projects/{projectId}`
- protect path resolution from escaping the configured data root
- create the initial runtime directory layout during project creation
- persist runtime data in Docker via a dedicated API volume

## Decisions

- API config gets optional `DATA_ROOT` with default `data`
- runtime paths are resolved relative to process cwd unless `DATA_ROOT` is absolute
- project creation creates:
  - `data/projects/{id}/`
  - `src/`
  - `repo/`
  - `deploy/`
- `env.enc` and `deploy/last-deploy.log` remain path helpers only in this slice
- runtime layout creation is invoked from `projectService.createProject`

## Out Of Scope

- ZIP/Git source ingestion
- workspace replacement policy
- env encryption writes
- deploy logging
- runtime deletion/cleanup

## Tests

- config coverage for `DATA_ROOT`
- runtime path helper coverage for stable paths and traversal guard
- runtime layout creation coverage for required directories
- project create integration coverage for directory creation under configured data root
