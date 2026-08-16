# SECURITY — Komyuter Authentication & Identity: Audit Findings

**Status**: Investigation report — findings, evidence, and recommendations. RBAC direction decided (§6.2); the session strategy (§6.1) is still open. Findings from this report have since been actioned by `specs/009-auth-quick-wins` (see §0 resolution table); the open items are S2/E1/E2/R4/L4/L5/M1/R3.

**Scope**: `apps/server` (Fastify + Supabase Auth), `apps/admin` (SPA), `supabase/` (config + migrations + seed), and the commuter app gap (`apps/mobile`).

**Method**: whole-system code investigation of every auth touchpoint, conducted on branch `feat/admin`. Evidence is cited as `file:line` throughout. This report is not a diff review — the pending branch diff contained no auth code.

---

## 0. Resolution status (feature 009-auth-quick-wins)

| ID                         | Status                   | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1                         | **Resolved** (mitigated) | Production builds now inject a strict CSP `<meta>` — no `'unsafe-inline'`, no `'unsafe-eval'` (`apps/admin/vite.config.ts`, build-time only; dev keeps no CSP for Vite HMR). The `localStorage` token decision itself is unchanged (documented ADR-0006 choice). **Limitation**: `frame-ancestors` cannot be expressed in a `<meta>` CSP (header-only) — deferred to the future hosting layer that serves the built SPA (§8). |
| S3                         | **Resolved**             | `createOriginGuard` (`apps/server/src/api/origin-guard.ts`, registered after CORS in `app.ts`) rejects any non-allowlisted `Origin` header with the standard 403 envelope; allowlist comes from `ADMIN_ORIGINS` (defaults to the local Vite origins). Requests without an `Origin` and OPTIONS preflights pass.                                                                                                               |
| L1                         | **Resolved**             | Global 401 interceptor (`apps/admin/src/lib/api.ts`): clears the token, saves the current path to `sessionStorage`, emits `sessionExpired`; `AuthProvider` flips state; `RequireAuth` redirects to `/login` with a `sessionExpired` flag and the login screen shows an explanatory banner.                                                                                                                                    |
| L2                         | **Resolved**             | `POST /api/auth/logout` (`apps/server/src/api/auth-login.ts`): best-effort `auth.admin.signOut(token, "global")`, idempotent 204 for valid/invalid/missing tokens; emits `security.sign_out`.                                                                                                                                                                                                                                 |
| L3                         | **Resolved**             | `restoreSession()` (`apps/admin/src/features/auth/auth.tsx`) classifies NETWORK/5xx as `unreachable` — token KEPT, `BackendUnreachable` screen with Retry (never labelled "session expired"); only a real 401 clears the token.                                                                                                                                                                                               |
| R1                         | **Resolved**             | Single `isAdminUserId(db, userId)` helper (`apps/server/src/api/auth.ts`) used by the guard, login, and `/me` — no duplicate inline lookups remain.                                                                                                                                                                                                                                                                           |
| R2                         | **Resolved**             | Every login denial (wrong password, non-admin, unconfirmed email, dev-credential refused, throttled) returns the identical `401 "Invalid email or password"` after a uniform 250 ms delay (FR-005); denial reasons appear only in security-event logs.                                                                                                                                                                        |
| E3                         | **Resolved**             | Dev-credential gate (`apps/server/src/api/auth-login.ts`): the documented seed credential is refused unless `ALLOW_DEV_CREDENTIAL=true` (local `.env` only; `.env.example` defaults false).                                                                                                                                                                                                                                   |
| E4                         | **Partial**              | App-level in-memory login throttler (`apps/server/src/api/throttle.ts`): 5 failures / 5 min → 15-min block per account and per source IP. Closes the brute-force gap for the single-instance admin deployment, but is not distributed — multi-instance needs a shared store.                                                                                                                                                  |
| R3                         | **Not touched**          | RLS remains out of scope: the Fastify server is still the sole DB writer; direct-Supabase commuter access (ADR-0006) is future work.                                                                                                                                                                                                                                                                                          |
| S2, E1, E2, R4, L4, L5, M1 | **Open**                 | Unchanged — see the original findings and §8 recommendations.                                                                                                                                                                                                                                                                                                                                                                 |

---

## 1. Current architecture (verified map)

| Component                 | Implementation                                                                                                                                                 | Location                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Identity provider         | Supabase Auth (GoTrue) — no DIY JWT (ADR-0006)                                                                                                                 | `docs/adr/0006-supabase-auth.md`                                                     |
| Server-side client        | One **service-role** `supabase-js` client, `persistSession: false`, `autoRefreshToken: false`                                                                  | `apps/server/src/config/supabase.ts`                                                 |
| Login                     | `POST /api/auth/login` (public): `signInWithPassword` → `admin_users` check → returns only `access_token` + profile; **`refresh_token` discarded server-side** | `apps/server/src/api/auth-login.ts:24-58`                                            |
| Session restore           | `GET /api/auth/me`: Bearer → `getUser` → `admin_users` check                                                                                                   | `apps/server/src/api/auth-login.ts:60-88`                                            |
| Guard                     | `preHandler` on `/api/admin/*`: Bearer → `getUser` (network call) → `admin_users` lookup → sets `request.adminUserId`                                          | `apps/server/src/api/auth.ts:26-45`; registered `apps/server/src/api/index.ts:23-36` |
| Token storage (admin SPA) | `localStorage` key `komyuter.admin.token`; axios interceptor injects `Authorization: Bearer`                                                                   | `apps/admin/src/lib/api.ts:3-38`                                                     |
| Client session state      | `AuthProvider` (`loading/unauthenticated/authenticating/authenticated`), boot restore via `me()`, `RequireAuth` route gate                                     | `apps/admin/src/features/auth/auth.tsx`, `RequireAuth.tsx`                           |
| Roles                     | Binary: valid Supabase token **and** row in `admin_users` (FK → `auth.users`)                                                                                  | `supabase/migrations/0001`, `0002`                                                   |
| Commuter identity         | **None** — `apps/mobile` is a starter with zero auth code; anonymous per ADR-0006                                                                              | `apps/mobile/app/*`                                                                  |
| Auth config               | `jwt_expiry = 3600`, refresh rotation on (reuse interval 10 s), `enable_signup = true`, `minimum_password_length = 6`, `enable_confirmations = false`          | `supabase/config.toml:165-226`                                                       |

### End-to-end flow (as built)

1. Admin submits email/password → Fastify `POST /api/auth/login` proxies to GoTrue with the service-role client, returns `{ access_token, user }` if the signer is in `admin_users` (403 for a valid signer who is not).
2. SPA stores `access_token` in `localStorage`; every request attaches it as a Bearer header.
3. Each admin request is validated by: Bearer parse → **network** `GET /auth/v1/user` via `supabase.auth.getUser(token)` → Postgres lookup in `admin_users` → proceed (or 401/403).
4. Token expires after 3600 s. There is **no refresh endpoint**, **no client-side 401 redirect**, and **no server-side logout/revocation** — logout clears `localStorage` only.

---

## 2. Findings

Severity: **High** = actively exploitable or breaks the session contract; **Medium** = meaningful weakness/risk; **Low** = hardening gap or thesis-scale acceptable.

### 2.1 Token storage & transport

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                     | Evidence                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | **High** | Access token lives in `localStorage`, readable by any XSS in the admin app. No HttpOnly cookie, no CSP meta in `index.html`, no `dangerouslySetInnerHTML` (good). This was a _documented, deliberate_ choice (specs/005 `research.md` "token-passthrough path"; `contracts/auth-api.md:24`), but it is the single largest client-side risk. | `apps/admin/src/lib/api.ts:15-25`; `apps/admin/index.html`    |
| S2  | Low      | Plain HTTP end-to-end in dev (`http://127.0.0.1:3000`, Vite dev server, Fastify on `0.0.0.0`). Acceptable locally; production needs TLS + HSTS. No production deployment config exists yet.                                                                                                                                                 | `supabase/config.toml:159-163`; `apps/server/src/index.ts:17` |
| S3  | Low      | CORS fully open (`origin: true` — reflects any origin). Bearer tokens are not auto-attached cross-origin, so no token exfiltration today, but it must become an explicit allowlist in production.                                                                                                                                           | `apps/server/src/api/app.ts:38`                               |

### 2.2 Session lifecycle (creation, expiration, refresh, logout)

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                            |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| L1  | **High** | **No refresh mechanism and no graceful session-expiry handling.** The refresh token never reaches the client and there is no `/api/auth/refresh`. After 1 h every admin call returns 401, but only `me()` reacts to `UNAUTHORIZED`; the axios response interceptor and `queryClient` have no global 401 handler. Users are left on a dead "authenticated" screen with failing queries/toasts instead of being returned to login. | `apps/admin/src/features/auth/api.ts:31-34`; `apps/admin/src/lib/api.ts:40-72`; `apps/admin/src/lib/queryClient.ts` |
| L2  | Medium   | **Logout is client-side only; no server-side revocation.** `signOut` clears `localStorage`; the GoTrue session minted at login is never revoked (no `signOut`/`revokeToken`/`auth.admin.*` anywhere in the server). The access token stays valid up to 1 h after logout — a real window on a shared or compromised device.                                                                                                       | `apps/admin/src/features/auth/auth.tsx:71-75`; `apps/server/src/api/auth-login.ts:30-34`                            |
| L3  | Low–Med  | Boot restore swallows **all** errors: any `me()` failure (network, 5xx) sets `status: "unauthenticated"`, kicking the user to the login screen while the (still-valid) token remains in `localStorage`. No distinction between "no session" and "server unreachable".                                                                                                                                                            | `apps/admin/src/features/auth/auth.tsx:44-51`                                                                       |
| L4  | Low      | Orphaned GoTrue sessions: every login mints a session/refresh-token row that is never cleaned up; no session-list or revocation surface exists.                                                                                                                                                                                                                                                                                  | `apps/server/src/api/auth-login.ts`                                                                                 |
| L5  | Low      | The client never decodes the JWT to pre-empt expiry or proactively clear stale tokens.                                                                                                                                                                                                                                                                                                                                           | `apps/admin/src/lib/api.ts`                                                                                         |

### 2.3 Authorization & roles

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| R1  | Medium   | Authorization logic (`getUser` + `admin_users` check) is copy-pasted in **three** places: guard, login, `/me`. Any change to authorization semantics must be applied three times — drift risk, no single source of truth.                                                                                                                                        | `apps/server/src/api/auth.ts:26-45`; `apps/server/src/api/auth-login.ts:36-44, 71-78` |
| R2  | Medium   | **Credential-confirmation leak**: login returns 403 only _after_ a successful password check, and the UI says "This account does not have administrator access" (`AuthForm.tsx:31`). An attacker learns that an email exists **and** that the password is correct. Documented FR-002 tradeoff; a generic 401 would be safer.                                     | `apps/server/src/api/auth-login.ts:42-44`                                             |
| R3  | Low      | No RLS policies and no least-privilege DB role — all access bypasses Postgres security via the service role. Safe while the Fastify server is the sole writer, but wide open the moment a direct-Supabase commuter path exists (ADR-0006's optional sign-in). `admin_users` also has no `disabled`/audit columns — deprovisioning is row deletion with no trail. | `supabase/migrations/0001` (no RLS DDL)                                               |
| R4  | Low      | Authn state is coarse, not authz: `request.adminUserId` feeds only logging. A single binary admin fits thesis scope but leaves no room for partial permissions without a refactor.                                                                                                                                                                               | `apps/server/src/api/auth.ts:44`; `apps/server/src/api/app.ts:40-57`                  |

### 2.4 Identity propagation & architecture

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                       |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| E1  | Medium   | **Every admin request costs a GoTrue network round-trip + a DB query.** `supabase.auth.getUser(token)` performs `GET {url}/user` per invocation (verified in installed `@supabase/auth-js` `GoTrueClient.js` `_getUser`), on top of the `admin_users` lookup. Latency cost plus a hard availability coupling: the API degrades/dies if GoTrue is down or slow. Local HS256 JWT verification (via the Supabase JWT secret) or a short-TTL cache removes both. | `apps/server/src/api/auth.ts:32-40`; auth-js `GoTrueClient.js` |
| E2  | Medium   | **Public login runs on the service-role client** — a superuser credential processes untrusted email/password input on a public endpoint. Not exploitable today (zod-validated, tests green), but defense-in-depth says: anon-key client for public auth operations, service role only for privileged operations.                                                                                                                                             | `apps/server/src/index.ts:11-14`; `auth-login.ts:30-31`        |
| E3  | Low      | `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars are validated but **never read** by server code — dead config. The real credential is baked into `supabase/seed.sql` (`komyuter-admin-dev`, documented dev-only; the CLI cannot interpolate env). Drift risk between `.env.example` and the seed.                                                                                                                                                                    | `apps/server/src/config/env.ts:12-13`; `supabase/seed.sql:37`  |
| E4  | Low      | No Fastify-level rate limiting on login (no `@fastify/rate-limit` dependency); brute force relies solely on GoTrue's `sign_in_sign_ups = 30 / 5 min / IP`.                                                                                                                                                                                                                                                                                                   | `apps/server/package.json`; `supabase/config.toml:207`         |
| M1  | Gap      | **No commuter identity exists.** ADR-0006's optional sign-in, per-commuter trace dedup, and the "Verified · N commuters" trust badge have no implementation and no storage decision (e.g. `expo-secure-store`, anon→signed-in migration, trace ownership via `auth.uid()`). Identity management is currently 100% admin-side.                                                                                                                                | `apps/mobile/app/*`; `docs/adr/0006-supabase-auth.md`          |

---

## 3. What is done well (keep)

- Supabase Auth instead of hand-rolled JWTs (ADR-0006) — correct call.
- Refresh token never leaves the server; rotation is enabled with a sane reuse interval (moot today, future-proof).
- Tokens travel in the `Authorization` header, never in URLs; no cookies → no CSRF surface.
- Consistent `{ success, data | error }` envelope with real 401/403 semantics; guard, login, and `/me` have integration test coverage (`apps/server/tests/integration/auth-login.test.ts`, `auth.test.ts`).
- Per-request `admin_users` revalidation is correctness-first (instant deprovisioning) — it just isn't cached.
- Env validated via zod; `.env` gitignored; the service-role key never appears in any client bundle; the login 401 message does not leak user existence.

---

## 4. Recommendations (phased)

### Phase 1 — quick hardening (days)

1. **Global 401 interceptor** in the admin axios client → clear token, redirect to `/login` with `returnTo` + "Session expired" toast. Closes the L1 UX hole immediately.
2. **`@fastify/rate-limit` on `/api/auth/login`** (e.g. 10 / 5 min / IP) — defense-in-depth over GoTrue (E4).
3. **CORS allowlist** from env instead of `origin: true` (S3).
4. **CSP + security headers** for the admin SPA (multiplier against S1).
5. **Tighten `supabase/config.toml` before any shared deployment**: `enable_signup = false` (admin-only), `minimum_password_length = 8`, `enable_confirmations = true`; rotate the seed password (E3).
6. Consider a **generic 401 instead of 403** on login for non-admins (R2).

### Phase 2 — session architecture (open decision, §6.1)

7. Pick a session strategy:

   - **Option A (recommended for a real admin app): HttpOnly `Secure` + `SameSite` session cookie.** The server keeps the refresh token (or an opaque session id) out of JavaScript's reach, adds `POST /api/auth/refresh` and `POST /api/auth/logout` (revoking the GoTrue session). Kills S1 (XSS exposure) and L2 (revocation) at once; CSRF is mitigated via `SameSite` + a custom-header requirement. No cookies exist today, so this is purely additive.
   - **Option B (minimal, preserves the current design): keep Bearer + `localStorage`**, add a refresh endpoint and proactive pre-expiry refresh on the client, and compensate for S1 with a strong CSP. Less work; the XSS exposure remains.

8. **Local JWT verification** with the Supabase JWT secret (fallback to `getUser`) to remove the per-request GoTrue round-trip (E1).

### Phase 3 — architecture & identity strategy

9. Extract one `requireAdmin(request)` helper used by the guard, login, and `/me` (R1) — the natural seam for RBAC (§6.2).
10. **Plan the commuter identity** before building the mobile app's optional sign-in: `expo-secure-store`, anon↔signed-in migration, `auth.uid()` trace ownership, and RLS for any direct-Supabase path (M1, R3).
11. Add RLS policies + a least-privilege DB role as defense-in-depth when the architecture changes (not urgent today).

---

## 5. Risk summary (one line)

The `localStorage` token plus the missing refresh/401 flow (S1 + L1) means an hour after login the app quietly breaks, and any XSS in the admin page steals the session outright; the service-role-on-public-login pattern (E2) and the 3×-duplicated authorization logic (R1) are the architecture smells to fix while redesigning.

---

## 6. Open decisions

### 6.1 Session strategy (Phase 2)

Option A (HttpOnly cookie + server-held session/refresh + revocation endpoints) vs Option B (keep Bearer + `localStorage`, add refresh + proactive expiry handling). Choice affects S1, L1, L2, and the amount of client/server rework.

### 6.2 RBAC — Discord-Permissions-style granular control (decided)

**Decisions (2026-08)**

- **Scope**: admin dashboard only. The commuter app stays anonymous (ADR-0006); commuter identity is only for future trace dedup, never permissions.
- **Model**: global permission **bits** per role — no per-entity overwrites, no role hierarchy, no deny semantics (denial = absent bit). Roles attach to users via the existing Supabase identity (`auth.users.id`).
- **Revocation**: per-request Postgres revalidation of roles + permissions (extends today's `admin_users` pattern); no role claims in the JWT — revocation is instant.
- **Management**: full role & permission builder in the admin UI, gated to `ADMINISTRATOR` holders.

**Design sketch (to be specced, not yet implemented)**

- Tables: `admin_roles` (`role_id`, `name`, `permissions bigint`) + `admin_user_roles` (`user_id`, `role_id`). `admin_users` is superseded: a user is an admin iff they hold ≥ 1 role; the seeded admin gets a role with all bits (super admin).
- Permission bits as `1n << n` constants in `@komyuter/shared` — one canonical list shared by the Fastify guard and the admin UI. Initial set: `ADMINISTRATOR` (bypasses all), `ROUTES_EDIT`, `FARES_EDIT`, `EXPORT_DATASET`, `MAPBOX_GEOSERVICES` (the proxy costs real tokens per call), `ADMIN_MANAGE` (meta-permission, effectively `ADMINISTRATOR`-only).
- Server: evolve the R1 seam — extract `requireAdmin(request)` from the guard/login/`/me` duplication, then add `requirePermission(bit)`; the guard unions the caller's roles and checks the bit. Guard stays a `preHandler` on `/api/admin/*`.
- Admin UI: "Roles & Permissions" page (role CRUD + bit pickers) and "Admins" membership management, both behind `ADMIN_MANAGE`.
