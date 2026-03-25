# E3-3 ZIP upload + safe extract

## Scope

- add guarded `POST /api/projects/:id/source/zip`
- accept raw ZIP bodies without multipart
- extract safe archives into `data/projects/{id}/src`
- keep repeat-upload replace policy out of scope until `E3-5`

## Decisions

- endpoint accepts `application/zip` and `application/octet-stream`
- upload is parsed as a raw `Buffer` with a fixed max upload size
- extraction is validated before write for:
  - ZIP signature
  - path traversal / absolute paths
  - symlinks
  - special files
  - total extracted size
- extraction happens in a temporary directory under the project root
- current slice only succeeds when `src/` is still empty
- success response is `204 No Content`
- suspicious archives return readable standardized API errors

## Out Of Scope

- multipart form upload
- workspace replace policy for repeated uploads
- Git clone flow
- deploy execution
- env encryption writes
- audit events

## Tests

- route happy path extracts regular files into `src/`
- missing project returns standardized `404`
- repeated upload returns standardized `409`
- traversal, symlink, and special-file archives return readable `422`
- oversized upload and oversized extracted content return readable `422`
