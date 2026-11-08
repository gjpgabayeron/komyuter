# Contract — `POST /api/auth/login`

**Consumer**: admin dashboard (`apps/admin/src/features/auth/api.ts`).
**Producer**: Fastify server (`apps/server/src/api/auth-login.ts`).
**Auth**: public (no bearer token).

## Request

```jsonc
{ "email": "admin@komyuter.ph", "password": "••••••••" }
```

Validation (zod `loginSchema`): `email` must be a valid email; `password` min
length 1. Malformed → `422` (see envelope below).

## Responses

### 200 — success

```jsonc
{
  "success": true,
  "data": {
    "access_token": "<GoTrue access token>",
    "user": {
      "id": "<uuid>",
      "email": "admin@komyuter.ph",
      "name": "Admin Komyuter",
    },
  },
}
```

`name` comes from `user_metadata.full_name` (empty string when absent). The
response intentionally omits `refresh_token`.

### 401 — denied (UNIFIED — FR-005)

**Every** denial — wrong password, valid credentials without administrative
access, unconfirmed email, throttled, dev-credential refused in a non-local
environment — produces this **identical** response, after a uniform delay
(`DENIAL_MIN_MS = 250`):

```jsonc
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" },
}
```

Notes:

- Status code, code, and message are the same in all denial cases (FR-005).
- The server records which case actually occurred only in structured security
  logs (`security.sign_in_failure` / `security.sign_in_throttled`), never in the
  response.

### 422 — validation

```jsonc
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "<zod detail>" },
}
```

Malformed bodies are **not** counted as failed attempts (they never reach
credential validation).

## Behavioral contract

- Successful sign-in clears the throttler counters for that account and that
  source (FR-004).
- An expired/revoked previous session never blocks a fresh sign-in (FR-001 A4).
- Throttling: after ≥ 5 failed attempts within any 5-minute window (per account
  or per source), further attempts are refused for ≥ 15 minutes (FR-003).
