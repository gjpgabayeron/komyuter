# Contract — `POST /api/auth/logout`

**Consumer**: admin dashboard sign-out flow (`apps/admin/src/features/auth/auth.tsx`
→ `lib/api.ts`).
**Producer**: Fastify server (`apps/server/src/api/auth-login.ts`).
**Auth**: bearer token (`Authorization: Bearer <access_token>`).

## Request

`POST /api/auth/logout` with the current access token in the `Authorization`
header. No body.

## Response

### 204 — always

The endpoint is **idempotent**: a valid token revokes **all** sessions for the
user server-side (GoTrue `admin.signOut(jwt, "global")`); an invalid, expired, or
missing token still returns `204` (the client discards its token either way —
nothing is leaked about token validity).

The client treats sign-out as best-effort: it calls this endpoint, then clears the
stored token and navigates to `/login` regardless of the outcome. A slow or
unreachable backend must never block the UI sign-out.

## Behavioral contract

- Revokes the session server-side so the signed-out token is dead immediately
  (no replay within the remaining JWT TTL).
- Always produces a `security.sign_out` structured log record (account from the
  token subject, or `unknown` when the token cannot be resolved) — FR-014.
