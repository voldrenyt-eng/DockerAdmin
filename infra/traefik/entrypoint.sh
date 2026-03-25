#!/bin/sh

set -eu

acme_staging="${TRAEFIK_ACME_STAGING:-true}"
acme_email="${TRAEFIK_ACME_EMAIL:-admin@example.com}"

case "$acme_staging" in
  true|TRUE|1|yes|YES|on|ON)
    acme_ca_server="https://acme-staging-v02.api.letsencrypt.org/directory"
    ;;
  false|FALSE|0|no|NO|off|OFF)
    acme_ca_server="https://acme-v02.api.letsencrypt.org/directory"
    ;;
  *)
    echo "Invalid TRAEFIK_ACME_STAGING value: $acme_staging" >&2
    exit 1
    ;;
esac

mkdir -p /etc/traefik/acme
touch /etc/traefik/acme/acme.json
chmod 600 /etc/traefik/acme/acme.json

cat > /tmp/traefik.generated.yml <<EOF
entryPoints:
  web:
    address: ":80"

api:
  dashboard: true
  insecure: true

providers:
  file:
    filename: /etc/traefik/dynamic/routes.yml
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${acme_email}"
      storage: /etc/traefik/acme/acme.json
      caServer: "${acme_ca_server}"
      httpChallenge:
        entryPoint: web

log:
  level: INFO
EOF

exec traefik --configFile=/tmp/traefik.generated.yml
