# E9-1 Telegram Notifier Service Design

## Scope

Add the narrow notifier foundation for the notifications epic:

- introduce one standalone Telegram notifier service in the API codebase
- reuse the existing optional `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` env config
- keep deploy execution untouched in this slice

This slice intentionally does not yet send deploy `SUCCESS/FAILED` messages. That integration belongs to `E9-2`.

## Service contract

The notifier exposes a minimal best-effort API:

- `isConfigured()` returns whether both Telegram env values are present
- `sendMessage({ text })` returns one of:
  - `sent`
  - `disabled`
  - `failed`

The service must not throw transport failures back to callers. That keeps future deploy integration narrow and safe.

## Transport model

When configured, the service sends a plain Telegram Bot API request to:

- `POST https://api.telegram.org/bot<TOKEN>/sendMessage`

with a JSON body containing:

- `chat_id`
- `text`

This slice keeps the transport minimal:

- no retries
- no markdown/HTML formatting
- no richer routing

## Safety

- missing Telegram config returns `disabled` without any outbound request
- request failures return `failed`
- warning callbacks receive only a safe high-level message
- the notifier does not surface the bot token or raw request URL in warnings

## Out of scope

- deploy success/fail hooks
- message templates for different events
- retry/backoff policy
- persistent notification queue

## Verification

Minimum verification for this slice:

- unit tests cover disabled mode when config is incomplete
- unit tests cover the request shape passed to the Telegram transport
- unit tests cover failure swallowing plus safe warning output without token leakage
