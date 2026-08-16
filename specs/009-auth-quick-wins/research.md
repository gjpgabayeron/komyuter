# Phase 0 Research — Auth Quick Wins

Consolidated from five parallel investigations: server auth internals, Supabase
config/seed/migrations, admin SPA auth flow, serving/CSP topology, and the GoTrue
admin API (supabase-js 2.111). Every decision is grounded in `file:line` evidence
from the repo; no open questions remain.

## R1 — Unified denied sign-in outcome (FR-005)

**Evidence**: `apps/server/src/api/auth-login.ts:32-34` maps any GoTrue sign-in
failure to `401 UNAUTHORIZED "Invalid email or password"`; `:42-44` maps a
successful-but-non-admin sign-in to `403 FORBIDDEN "User is not an admin"`. Tests
assert only codes, never messages (`auth-login.test.ts:44-58`, `:60-80`).

**Decision**: Collapse both paths to `401 UNAUTHORIZED` with the single message
`"Invalid email or password"`. Apply a uniform denial delay
(`DENIAL_MIN_MS = 250`) to **every** denied login response — wrong password,
non-admin, unconfirmed email, throttled, dev-credential-refused — so wording **and**
timing are indistinguishable. Throttled denials (which never reach GoTrue) get the
same delay.

**Rationale**: 401 + one message + one delay is the strongest baseline. The two
existing outcomes differ in status code, message, and timing — all three leaks are
closed by one change.

**Alternatives considered**:

- Keep 403 with an identical message — status still leaks (rejected).
- Random/variable delay — over-engineering for a single-instance admin tool (rejected).

## R2 — Throttling (FR-003 / FR-004)

**Evidence**: No rate limiting exists in the server (grep for `cache|throttle|rateLimit`
finds only the fare field `rate_per_km`). GoTrue's own limits are loose
(`sign_in_sign_ups = 30`/5 min/IP, `supabase/config.toml:197-211`) and keyed to
GoTrue endpoints, not our `/api/auth/login`. ADR-0005 forbids Redis. The server is a
single Fastify instance (`apps/server/src/index.ts:17`, no clustering).

**Decision**: In-memory sliding-window throttler in `apps/server/src/api/throttle.ts`,
instantiated **per app instance** inside `registerAuth`. Keys: normalized account
email (lowercased) and `request.ip`. Constants: `MAX_FAILURES = 5`,
`WINDOW_MS = 5 min`, `BLOCK_MS = 15 min`. Check **before** the GoTrue call; record a
failure on every denial; clear the account+source counters on a successful sign-in
(FR-004). Restart clears counters — accepted for a single-instance local deployment.

**Rationale**: Single instance + no Redis makes an in-memory store the simplest
compliant mechanism. Per-account + per-IP covers both the credential-guessing and the
distributed-guess attack surfaces.

**Alternatives considered**:

- GoTrue `banned_until` via `admin.updateUserById({ ban_duration: "15m" })` — persists
  across restarts but is per-account only (no per-IP), adds admin-API calls, and
  cannot clear per-source (rejected).
- `@fastify/rate-limit` — global per-IP on all routes, no per-account key, no
  success-clearing (rejected).
- DB-backed counters — contradicts the Q2 "no new database" decision and adds write
  load to every denial (rejected).

## R3 — Signup, password length, email confirmation (FR-006 / FR-007 / FR-008)

**Evidence**: `enable_signup = true` in both `[auth]` (`config.toml:176`) and
`[auth.email]` (`:221`); `enable_confirmations = false` (`:226`);
`minimum_password_length = 6` (`:182`). The seed admin already has
`email_confirmed_at` set (`seed.sql:24`). Test users are created with
`email_confirm: true` (`tests/integration/helpers.ts:63`). No app code calls
`signUp` anywhere (zero grep hits in `apps/`).

**Decision**: In `supabase/config.toml`: `enable_signup = false` (both sections),
`enable_confirmations = true`, `minimum_password_length = 8`. GoTrue then refuses
public signups (`signup_disabled`) and unconfirmed sign-ins (`email_not_confirmed`),
which the server maps to the unified denial (R1). Seed admin and test users are
unaffected (all confirmed).

**Rationale**: Config-level enforcement with zero code drift and zero regressions —
no signup code exists, all test users are confirmed.

**Alternatives considered**:

- Server-side confirm check in the login route — duplicates GoTrue and drifts
  (rejected).
- Leave `enable_signup` on and rely on the `admin_users` check — SC-004 demands zero
  new accounts, and an unconfirmed-but-active account row is still an account
  (rejected).

## R4 — Dev-credential gate (FR-012)

**Evidence**: The seed password `komyuter-admin-dev` is committed in plaintext
(`seed.sql:37`). `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars are validated
(`env.ts:12-13`) but **never read** by runtime code (grep — only tests and README
use them). `docs/SECURITY.md:72` (finding E3) flags this.

**Decision**: Add env `ALLOW_DEV_CREDENTIAL` (boolean, **default false**). In the
login route, if the presented email/password equals the documented seed credential
(constant `DEV_CREDENTIAL` in the server, matching `seed.sql`), refuse with the
unified denial unless `ALLOW_DEV_CREDENTIAL` is true. `apps/server/.env` sets it
`true` (local only). Tests inherit it through the loaded `.env`.

**Rationale**: Explicit gate with a safe default (closed). The credential stays
usable for local convenience and the test suite, and any other deployment refuses it.

**Alternatives considered**:

- Rotate the seed password to a random value — breaks the documented local onboarding
  and the committed test helpers (rejected).
- Remove `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars — tests and README rely on them as
  the seed mirror (rejected; they stay as documentation, the gate is the enforcement).

## R5 — Origin allowlist (FR-010)

**Evidence**: The admin SPA is served by Vite on `:5173` and calls the API
cross-origin at `VITE_API_URL` (default `http://localhost:3000`,
`apps/admin/src/lib/api.ts:27-30`, `.env.example:12`); there is no dev proxy; CORS is
permissive (`apps/server/src/api/app.ts:38`); integration tests use
`fastify.inject()` without an `Origin` header.

**Decision**: A Fastify `onRequest` hook registered **after** the CORS plugin:
any request that **has** an `Origin` header not in env `ADMIN_ORIGINS`
(comma-separated; default `http://localhost:5173,http://127.0.0.1:5173`) → `403`
with the standard envelope. Requests without `Origin` (curl, native mobile,
tests) pass. Preflight (`OPTIONS`) is handled by the CORS plugin before this hook.

**Rationale**: Origin validation is the standard CSRF defense for a bearer-token SPA;
browser requests always send `Origin`, non-browser clients don't. Skipping absent
`Origin` keeps tests and the (future) commuter app working.

**Alternatives considered**:

- Enforce on requests without `Origin` too — breaks curl/tests/native clients
  (rejected).
- CORS-callback-only rejection (no hard 403) — the browser blocks, but the server
  still processes the request; weaker defense-in-depth (rejected).

## R6 — CSP for the admin SPA (FR-009)

**Evidence**: No CSP exists anywhere (`docs/SECURITY.md:43`, finding S1). The admin is
a **static Vite build** with no production server in this repo — Fastify does not
serve it (no `@fastify/static`; `buildApp` registers only CORS/hooks/errors/routes,
`app.ts:32-83`). MapLibre GL 5.24 creates Web Workers from `blob:` object URLs
(maplibre needs `worker-src blob:`). Map tiles/styles/glyphs come from
`https://tiles.openfreemap.org` (`apps/admin/src/lib/tiles.ts:17-19`). Vite dev needs
inline scripts (React Fast Refresh preamble) and inline styles (vite client CSS
injection), so a static `<meta>` would break HMR.

**Decision**: Inject the strict CSP as a `<meta http-equiv="Content-Security-Policy">`
**at build time only**, via a small Vite plugin in `apps/admin` (`transformIndexHtml`
guarded on `mode === "production"`):

```
default-src 'self'; script-src 'self'; style-src 'self';
worker-src 'self' blob:; img-src 'self' data: blob: https://tiles.openfreemap.org;
font-src 'self' data:; connect-src 'self' https://tiles.openfreemap.org <API_ORIGIN>;
object-src 'none'; base-uri 'self'; form-action 'self'
```

`<API_ORIGIN>` is derived from `VITE_API_URL` at build time (the built app talks to
that origin). Dev keeps **no** CSP (HMR). `script-src 'self'` is the part that
matters for S1: the built bundle has no inline scripts.

**Known limitation**: `frame-ancestors` cannot be expressed in a `<meta>` CSP; it
must be a server header. Since this repo has no production server for the SPA, it is
deferred to the future hosting layer and recorded in `docs/SECURITY.md`.

**Alternatives considered**:

- Static meta in `index.html` — applies in dev and breaks HMR unless
  `'unsafe-inline'` is granted, which largely defeats the purpose (rejected).
- Server headers from Fastify — Fastify does not serve the SPA (rejected).
- Permissive CSP everywhere — fails the S1 mitigation goal (rejected).

## R7 — Sign-out endpoint & security-event logging (FR-014 / SC-007)

**Evidence**: Sign-out is client-only today (`auth.tsx:71-75`, `Header.tsx:38-42`).
The server is stateless-JWT (`auth.ts:32`). GoTrue's admin API revokes sessions
server-side: `supabase.auth.admin.signOut(jwt, "global")` (auth-js 2.111,
`GoTrueAdminApi.signOut` → `POST /logout?scope=global`, revokes **all** sessions for
the user). The server already logs per-request audit lines via an `onResponse` hook
(`app.ts:40-57`).

**Decision**:

1. New `POST /api/auth/logout` (bearer token): best-effort
   `supabase.auth.admin.signOut(token, "global")`, always `204`, idempotent — a dead
   token still yields `204` (no outcome leak). This makes sign-out server-observable
   and revokes the token immediately.
2. Structured security-event lines via pino: `security.sign_in_success`,
   `security.sign_in_failure`, `security.sign_in_throttled`, `security.sign_out`,
   each with `account`, `source` (`request.ip`), `outcome`, `reqId`, `ts`. The admin
   `signOut()` calls the endpoint before clearing storage (best-effort, never blocks
   the UI).

**Rationale**: Server-observable sign-out satisfies FR-014/SC-007; revocation makes a
signed-out token dead immediately instead of lingering for up to 1 h.

**Alternatives considered**:

- Token denylist table — contradicts Q2's no-database decision (rejected).
- Client-only logging — nothing observable server-side (rejected).

## R8 — Session expiry & backend-unreachable UX (FR-001 / FR-002 / FR-015)

**Evidence**: `restore()` funnels **every** startup error to `"unauthenticated"`
(`auth.tsx:46-50`); `me()` clears the token only on `UNAUTHORIZED` and rethrows
`NETWORK` (`api.ts:30-36`); there is **no global 401 handler** mid-session — expired
JWTs (1 h TTL, `config.toml:165`) surface as per-call toasts. A return-path mechanism
already exists (`RequireAuth.tsx:18-26` passes `state.returnTo`;
`redirect.ts:3-15` sanitizes it; `Login.tsx:23` uses it — open-redirect tested in
`src/tests/require-auth.test.ts:21-24`). `ConnectionBanner` uses `navigator.onLine`,
not server reachability (`useOnline.ts`).

**Decision**:

1. `restore()` classifies startup errors: `UNAUTHORIZED` → clear token,
   `"unauthenticated"`; `NETWORK` or 5xx → status `"unreachable"` (token kept).
   `RequireAuth` renders a new `BackendUnreachable` screen (message + Retry button
   that re-runs `restore()`); never the sign-in screen, never "session expired".
2. axios response interceptor: when a request carrying the stored token returns 401,
   emit a session-expired event (save current path to `sessionStorage` as return
   path, clear the stored token). `AuthProvider` subscribes: redirect to `/login`
   with a `sessionExpired` flag; `AuthForm` shows the "Your session expired — please
   sign in again" banner; after a fresh sign-in the saved return path wins.
3. A fresh sign-in always succeeds regardless of the old session (FR-001 A4 — the
   dead token is simply discarded).

**Rationale**: Reuses the existing returnTo/redirect seam; adds exactly the two
missing states (expired vs unreachable) with minimal new surface.

**Alternatives considered**:

- Silent token refresh — explicitly out of scope (spec Assumption; future decision).
- Global QueryClient `onError` handler — the axios interceptor covers non-query
  calls too (rejected).

## R9 — Uniform authorization seam (FR-011)

**Evidence**: One `preHandler` guard on the `/api/admin` plugin already covers every
admin route (`index.ts:23-36`, `auth.ts:26-45`); the `admin_users` lookup is
duplicated inline in three places (`auth.ts:36-41`, `auth-login.ts:37-41`, `:71-75`);
it is per-request and uncached, so revocation is already immediate (SC-006).

**Decision**: Extract a shared `isAdminUserId(db, userId)` helper used by the guard,
login, and `/me`. Keep the single guard seam. **RBAC (Discord-style permissions) is
deferred to a separate feature/ADR** per the user's decision (spec Q3) — this feature
only guarantees the seam exists and is uniform.

**Rationale**: De-duplicates the check and gives FR-011 a single enforcement point
that a future RBAC layer can extend.

**Alternatives considered**:

- Add RBAC tables/bitmask permissions now — explicitly deferred by the user
  (out of scope for 008).

---

## Integration notes

- GoTrue's own rate limits (`sign_in_sign_ups = 30/5min/IP`) remain as a second
  layer behind our `/api/auth/login` throttler.
- Security-event lines require an enabled pino logger; verify/ensure `logger: true`
  in the server entry (`apps/server/src/index.ts`) so `request.log`/`app.log` emit.
  Integration tests keep a silent logger (they assert behavior, not log output).
- `enable_confirmations = true` requires restarting local Supabase for config.toml
  changes to apply (`supabase stop && supabase start`), and the inbucket local SMTP
  (`config.toml:105-113`) receives confirmation links in local dev.
