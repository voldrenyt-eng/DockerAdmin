# E3-5 Source workspace replace policy

## Scope

- allow repeated ZIP upload to replace the existing `src/` workspace
- allow repeated Git clone to replace the existing `repo/` workspace
- preserve the previous working workspace when the new extract/clone or promotion fails
- keep all staging and cleanup inside `data/projects/{id}`

## Decisions

- both ZIP and Git flows still build the new source in a project-local staged directory first
- promotion is centralized in one helper that:
  - renames the current workspace into a project-local backup path
  - renames the staged workspace into the canonical target path
  - removes the backup only after successful promotion
- if promotion fails after the old workspace was moved aside, the helper restores the backup back into the canonical target path
- temporary and backup directories stay hidden and project-local via `.src-*` and `.repo-*` prefixes

## Out Of Scope

- env store or env read policy
- deploy execution
- private repositories
- submodules
- audit events

## Tests

- repeated ZIP upload replaces old files with the new `src/` workspace
- failed repeated ZIP upload keeps the previous `src/` workspace and leaves no `.src-*` temp directories
- repeated Git clone replaces old files in the `repo/` workspace
- failed repeated Git clone keeps the previous `repo/` workspace and leaves no `.repo-*` temp directories
