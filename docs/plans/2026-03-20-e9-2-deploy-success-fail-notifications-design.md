# E9-2 Deploy Success/Fail Notifications Design

## Scope

Wire Telegram notifications into the deploy lifecycle:

- send one Telegram message after a deploy finishes as `SUCCESS` or `FAILED`
- keep the message body minimal and safe
- ensure notifier-disabled or delivery-failed paths never change the deploy result

This slice intentionally builds on the standalone notifier from `E9-1` instead of adding any richer notification routing.

## Delivery point

The notification is sent only after:

- the final deploy status is persisted in `Deployment`
- the safe `DEPLOY_FINISH` audit write is attempted

This keeps the persisted deploy record as the source of truth even if notifications are unavailable.

## Message format

The Telegram payload stays plain text:

```text
Deploy SUCCESS|FAILED
Project: <project-slug>
Deployment: <deployment-id>
```

This slice does not include:

- `stdout` / `stderr`
- raw exception text
- secret-bearing env values
- markdown/HTML formatting

## Failure handling

- if the notifier is not configured, deploy still succeeds or fails normally and only a safe warning is emitted
- if Telegram delivery fails, deploy still returns the final result and only a safe warning is emitted
- warnings must not include the Telegram token or raw request URL

## Wiring

- `apps/api/src/index.ts` now creates the Telegram notifier from the existing env-backed config
- `apps/api/src/deploy/service.ts` consumes that notifier as an optional dependency
- deploy routes and DTOs stay unchanged in this slice

## Out of scope

- richer templates
- multiple notification channels
- retries/backoff/queueing
- web settings UI for Telegram

## Verification

Minimum verification for this slice:

- endpoint coverage proves `SUCCESS` deploys send one safe Telegram notification
- endpoint coverage proves `FAILED` deploys send one safe Telegram notification
- endpoint coverage proves disabled notifier paths only log a safe warning and do not change the deploy response
