#!/usr/bin/env bash

set -euo pipefail

set -a
source ./.env
set +a

: "${SEED_ADMIN_EMAIL:?SEED_ADMIN_EMAIL is required}"
: "${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD is required}"

docker compose --env-file .env -f infra/docker-compose.platform.yml up -d postgres
docker compose --env-file .env -f infra/docker-compose.platform.yml run --rm \
  -e SEED_ADMIN_EMAIL \
  -e SEED_ADMIN_PASSWORD \
  --build api \
  sh -lc 'cd /app/apps/api && pnpm run db:seed'
