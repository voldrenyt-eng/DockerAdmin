# E3-4 Public Git clone

## Scope

- add guarded `POST /api/projects/:id/source/git`
- accept `url` and optional `branch`
- clone only public `https://` repositories into `data/projects/{id}/repo`
- keep source replace policy out of scope until `E3-5`

## Decisions

- request body is JSON, validated through a shared DTO contract
- only `https://` URLs without embedded credentials are accepted
- clone runs through the system `git` binary with `--depth 1`
- when `branch` is provided, clone uses `--branch <branch> --single-branch`
- submodules stay disabled in MVP
- clone runs in a temporary project-local directory and is promoted into `repo/` only on success
- current slice succeeds only when `repo/` is still empty
- timeout and clone failures return readable standardized API errors

## Out Of Scope

- private repositories
- SSH or `git://` transports
- source replace policy
- deploy execution
- env encryption writes
- audit events

## Tests

- shared request schema trims `branch` and rejects non-https or credentialed URLs
- route happy path clones into `repo/`
- invalid request body returns standardized `422`
- missing auth returns standardized `401`
- service returns `409` when `repo/` already exists
- service cleans temporary clone directories on failure and preserves an empty `repo/`
