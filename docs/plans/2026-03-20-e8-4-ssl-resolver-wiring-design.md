# E8-4 SSL Resolver Wiring Design

## Scope

Add the first TLS baseline for domain routing:

- enable Traefik ACME `http-01`
- keep DEV usable with a staging toggle
- add a TLS resolver to generated domain routers only when `tlsEnabled=true`

This slice intentionally keeps the existing domain CRUD and full-snapshot route generation model from `E8-3`.

## Traefik startup model

Traefik static configuration now starts through `infra/traefik/entrypoint.sh`.

Why:

- avoid mixing static config methods
- derive the ACME CA server from one narrow env toggle
- initialize `acme.json` storage with safe permissions before Traefik starts

Current policy:

- `TRAEFIK_ACME_STAGING=true` is the default DEV path
- `TRAEFIK_ACME_STAGING=false` switches to the production Let's Encrypt CA
- `TRAEFIK_ACME_EMAIL` configures the ACME account email
- ACME storage lives at `/etc/traefik/acme/acme.json` on a named volume

## Route generation

The generated dynamic `routes.yml` keeps:

- base `api` and `web` routers
- one service per domain targeting `http://host.docker.internal:<port>`

For a domain row with `tlsEnabled=true`, the router now also includes:

```yaml
tls:
  certResolver: letsencrypt
```

Domains with `tlsEnabled=false` stay plain HTTP-only in this slice.

## Storage and wiring

- keep the dynamic routes file bind-mounted into both `api` and `traefik`
- mount a dedicated Traefik ACME named volume
- expose `TRAEFIK_ACME_EMAIL` and `TRAEFIK_ACME_STAGING` through compose env
- keep the resolver name fixed to `letsencrypt` for the MVP

## Out of scope

- HTTPS-only redirects
- multiple resolvers
- wildcard certificates / DNS challenge
- frontend domains UI

## Verification

Minimum verification for this slice:

- routes generator tests cover conditional TLS resolver output for `tlsEnabled=true`
- compose config renders with the new Traefik entrypoint, env vars, and ACME volume
- rebuilt Docker stack starts healthy and the Traefik container exposes the generated static config plus the `host.docker.internal` alias
