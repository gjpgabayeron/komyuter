# Quickstart — Auth Quick Wins (validation guide)

Proves the feature works end-to-end. Implementation details live in the plan and
the implementation phase; this file is a run guide. Contracts:
`contracts/login-api.md`, `contracts/logout-api.md`, `contracts/security-events.md`,
`contracts/csp-policy.md`; state: `data-model.md`.

## Prerequisites

- Local Supabase stack up with the **new** config:
  ```bash
  supabase stop && supabase start   # config.toml changes (signup/confirmation/password length) apply on start
  ```
  Local SMTP (inbucket, `:54324`) is available for confirmation links.
- `apps/server/.env` present with `ALLOW_DEV_CREDENTIAL=true` (local) and the
  seeded admin credentials.
- `pnpm install` at repo root.

## Automated validation

```bash
pnpm --filter server test          # Vitest: unit (throttle, env) + integration (auth flows)
pnpm --filter server typecheck
pnpm --filter admin test           # Vitest: auth/session/require-auth/CSP plugin unit tests
pnpm --filter admin build          # production build → assert CSP meta present in dist/index.html
pnpm lint && pnpm typecheck
```

Expected: all green. The integration suite specifically re-verifies every
hardening behavior below (tests are written first — TDD per `specs/001` tasks).

## Manual scenarios (admin SPA on `:5173`, API on `:3000`)

### 1. Unified denial (FR-005)

Sign in with: (a) wrong password, (b) valid credentials of a non-admin account,
(c) the dev credential with `ALLOW_DEV_CREDENTIAL` unset. All three: identical
`401` with message "Invalid email or password", each taking ≈250 ms.

### 2. Throttling (FR-003/004)

Attempt 6 wrong-password logins for the same account (or from the same browser)
within 5 minutes. Attempts 1–5: 401; attempt 6: 401 **and** ~250 ms (still
identical, never a different message). Sign in correctly → succeeds (FR-004,
counters cleared). Block lasts ≥ 15 min.

### 3. No public signup (FR-006)

From a fresh incognito window, hit the GoTrue sign-up endpoint or any UI signup
path — refused. `enable_signup = false` ⇒ zero new accounts (SC-004).

### 4. Email confirmation (FR-008)

Provision a new admin account via the service-role admin API without confirming →
sign-in refused with the unified 401. Confirm the email (inbucket in local dev) →
sign-in succeeds.

### 5. Dev credential only local (FR-012)

With `ALLOW_DEV_CREDENTIAL` unset: `admin@komyuter.ph` / `komyuter-admin-dev` → 401. With it `true` (local `.env`): works. Production-like env ⇒ dev credential
dead (SC-005).

### 6. Sign-out revokes (FR-014)

Sign in, copy the token from storage, sign out (UI), then replay the token
against `/api/admin/…` → 401. Server log contains `security.sign_out` with
`account`, `source`, `outcome`.

### 7. Security-event log coverage (SC-007)

After scenarios 1–2 and 6, grep the server output:

```bash
# each of these appears at least once with account + source + outcome
grep -o '"event":"security.sign_in_success"'    server.log
grep -o '"event":"security.sign_in_failure"'    server.log
grep -o '"event":"security.sign_in_throttled"'  server.log
grep -o '"event":"security.sign_out"'           server.log
```

### 8. Origin allowlist (FR-010)

`curl -i -X POST http://localhost:3000/api/auth/login -H 'Origin: https://evil.example' -d '…'`
→ `403`. Without an `Origin` header → passes (tests rely on this). The admin
dashboard's own origin (`http://localhost:5173`) → passes.

### 9. CSP (FR-009)

`pnpm --filter admin build`; open `apps/admin/dist/index.html` → contains the
`<meta http-equiv="Content-Security-Policy">` from `contracts/csp-policy.md`.
Serve `dist` on any static host, sign in, open the route map — map renders
(worker `blob:` + tiles allowed), devtools console shows no CSP violations.

### 10. Session expiry (FR-001/002) & unreachable backend (FR-015)

- Open the admin, wait past the 1 h JWT TTL (or delete the token manually), click
  any action → redirected to `/login` with the "session expired" banner; sign in
  → lands on the page you were on.
- Stop the API, reload the app → **backend-unreachable** screen with a Retry
  button (never the login form, never "expired"). Start the API, click Retry →
  app loads.

### 11. Immediate revocation (SC-006)

Remove the user from `admin_users` (SQL) while signed in → the next admin call
returns 401/403; no restart needed (per-request lookup).
