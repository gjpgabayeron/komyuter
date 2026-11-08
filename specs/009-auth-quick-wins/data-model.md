# Data Model — Auth Quick Wins

## Scope note

Per the feature's Q2 clarification, **no new database entities are introduced**:
security events go to structured server logs, and sign-in attempts live in an
in-memory throttler. This document describes the shapes of the state the feature
touches, the rules that constrain them, and the existing entities they build on.

## Existing entities (unchanged, referenced)

| Entity                  | Storage                                                 | Notes                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Administrator Account` | `auth.users` (Supabase GoTrue) + `admin_users` (public) | Identity + credential in GoTrue; admin grant is membership in `admin_users` (binary grant/revoke). FK `admin_users.user_id → auth.users.id` (migration 0002). |
| `Sign-in Session`       | none (stateless JWT)                                    | GoTrue access token, 1 h TTL (`config.toml:165`); validated per request via `supabase.auth.getUser(token)`; no refresh token is stored by the admin app.      |

## New: `Sign-in Attempt` (in-memory throttler state)

**Storage**: heap of a single Fastify instance (`apps/server/src/api/throttle.ts`);
not persisted, no DB table (ADR-0005: no Redis; single-instance deployment).

Per key (`account` = lowercased email, or `source` = `request.ip`):

```ts
interface ThrottleEntry {
  failures: number[]; // timestamps (ms) of denials inside the rolling window
  blockedUntil: number; // 0 when not blocked
}
```

**State transitions**:

- **Attempt (pre-check)**: if `blockedUntil > now` → deny (outcome `throttled`).
- **Denial** (wrong password / non-admin / unconfirmed / dev-credential refused):
  append `now` to `failures`, prune entries older than `WINDOW_MS`; if
  `failures.length >= MAX_FAILURES` → `blockedUntil = failures[0] + BLOCK_MS`.
- **Success**: delete the account key and the source key (FR-004 — a legitimate
  administrator is not locked out).
- **Window roll**: pruned entries roll off; a source never blocked is free to retry.

**Constants** (defaults, tunable at implementation without changing intent — spec
Assumption): `MAX_FAILURES = 5`, `WINDOW_MS = 5 * 60_000`,
`BLOCK_MS = 15 * 60_000`.

**Rules**:

- A blocked source/account is refused for **at least** 15 minutes after the 5th
  failure (FR-003).
- Throttled denials are indistinguishable from other denials to the client (FR-005):
  same 401 body, same ~250 ms delay, `outcome` differences exist only in server logs.

## New: `Security Event` (structured log record)

**Storage**: pino server logs (`request.log`/`app.log`), never a database (Q2).

```jsonc
{
  "level": "info",
  "time": "2026-08-10T09:30:00.000Z", // pino timestamp
  "reqId": "req-1", // pino request id (when present)
  "event": "sign_in_success", // catalog below
  "account": "admin@komyuter.ph", // email or user id; "unknown" if unresolvable
  "source": "127.0.0.1", // request.ip
  "outcome": "success", // success | denied | throttled | signed_out
}
```

**Event catalog** (every value maps 1:1 to FR-014 / SC-007):

| Event                        | When                                                                                      | outcome      |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| `security.sign_in_success`   | valid admin credentials accepted                                                          | `success`    |
| `security.sign_in_failure`   | any unified denial (wrong password, non-admin, unconfirmed email, dev-credential refused) | `denied`     |
| `security.sign_in_throttled` | pre-check refusal by the throttler                                                        | `throttled`  |
| `security.sign_out`          | `POST /api/auth/logout` (any outcome — idempotent)                                        | `signed_out` |

## Validation rules mapped from requirements

| Rule                                                                               | Source                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Denied sign-in outcomes identical in status (401), message, and timing (≥ ~250 ms) | FR-005                                                                              |
| ≤ 5 failures per 5 min per account and per source; block ≥ 15 min                  | FR-003                                                                              |
| Success clears the counters for that account and source                            | FR-004                                                                              |
| No public self-service account creation                                            | FR-006 (`enable_signup = false`)                                                    |
| Newly provisioned admin passwords ≥ 8 chars                                        | FR-007 (`minimum_password_length = 8`)                                              |
| Email confirmed before first sign-in                                               | FR-008 (`enable_confirmations = true`; seed admin already confirmed, `seed.sql:24`) |
| Documented dev credential accepted only when `ALLOW_DEV_CREDENTIAL=true` (local)   | FR-012                                                                              |
| Every admin action authorized by one rule (single guard seam)                      | FR-011                                                                              |
| Requests with an `Origin` not in `ADMIN_ORIGINS` are refused                       | FR-010                                                                              |
