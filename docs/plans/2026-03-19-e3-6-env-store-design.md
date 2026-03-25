# E3-6 Env store (encrypt at rest)

## Scope

- add guarded `PUT /api/projects/:id/env`
- accept project env content as JSON `{ content }`
- validate the narrow MVP `.env` format
- store only encrypted payloads in `data/projects/{id}/env.enc`
- keep plaintext values off disk and out of logs

## Decisions

- env content allows blank lines and `# ...` comment lines
- non-comment lines must follow `KEY=VALUE`, with shell-style variable names on the left side
- encryption uses `AES-256-GCM` with a random IV and an authenticated JSON envelope
- the encryption key is derived from `ENV_ENCRYPTION_KEY` and never persisted alongside project data
- writes reuse the existing runtime path helpers and project existence checks

## Out Of Scope

- deploy-time env injection
- env version history
- per-key editing or masking
- audit events with secret metadata

## Tests

- valid env content returns `204` and writes `env.enc`
- invalid env content returns standardized `422`
- encrypted payload on disk does not contain plaintext secret values
- plaintext `.env` is never created under the project runtime root
