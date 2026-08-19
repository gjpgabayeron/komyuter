---
description: "Task list for Auth Quick Wins feature implementation"
---

# Tasks: Auth Quick Wins

**Input**: Design documents from `/specs/009-auth-quick-wins/`

**Prerequisites**: plan.md, spec.md (user stories US1–US4), research.md (decisions R1–R9), data-model.md, contracts/ (login-api, logout-api, security-events, csp-policy), quickstart.md

**Tests**: TDD is the server convention (specs/001 tasks.md) and the admin app has a unit suite under `apps/admin/src/tests/` — every user story phase opens with failing tests.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are the real repo layout (verified against the current tree; plan.md's structure sketch was re-synced to match — see its Architecture alignment section)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + baseline so TDD red/green is meaningful.

- [x] T001 Create git branch `009-auth-quick-wins` (`git checkout -b 009-auth-quick-wins`)
- [x] T002 [P] Baseline verification — `pnpm --filter server typecheck`, `pnpm --filter server test`, `pnpm --filter admin test` all pass BEFORE any change (establish the green baseline)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Env surface shared by US3 (dev-credential gate) and US4 (origin allowlist). **⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Add `ALLOW_DEV_CREDENTIAL` (zod boolean, default `false`) and `ADMIN_ORIGINS` (comma-separated string, default `http://localhost:5173,http://127.0.0.1:5173`) to the env schema in `apps/server/src/config/env.ts`; add `apps/server/tests/unit/env.test.ts` (new — no unit env test exists today) with defaults assertions for the new vars

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Graceful session expiry (Priority: P1) 🎯 MVP

**Goal**: An expired session returns the administrator to sign-in with a clear "session expired" message; a fresh sign-in returns them to the page they were on.

**Independent Test**: Sign in, expire the session, perform an action → automatic return to sign-in with the "session expired" message; sign in again → same page restored.

### Tests for User Story 1 ⚠️ (write FIRST, ensure they FAIL)

- [x] T004 [P] [US1] Extend `apps/admin/src/tests/require-auth.test.ts` with the expired-session flow: a 401 mid-session redirects to `/login` with a `sessionExpired` flag, and a still-valid session performs no redirect
- [x] T005 [P] [US1] Add `apps/admin/src/tests/session-expired.test.ts` (new) for the axios response interceptor: a 401 on a request that carried the stored token clears the token, saves the current path to `sessionStorage`, and emits the session-expired event (mock axios)

### Implementation for User Story 1

- [x] T006 [P] [US1] Create the router-free emit/subscribe bus in `apps/admin/src/features/auth/sessionExpired.ts` (keeps `lib/api.ts` free of react-router)
- [x] T007 [US1] Add an axios response interceptor in `apps/admin/src/lib/api.ts` (after the existing envelope interceptor): when a response is 401 and a token was stored at request time → save the current path to `sessionStorage` as the return path, `clearStoredToken()`, emit sessionExpired; leave the `NETWORK`/`ApiError` behavior unchanged for other failures (depends on T006)
- [x] T008 [US1] Subscribe in the `AuthProvider` in `apps/admin/src/features/auth/auth.tsx`: on sessionExpired → flip status to `unauthenticated` only — the provider NEVER navigates (it sits above `BrowserRouter`, so `useNavigate` is unavailable); `RequireAuth`'s existing declarative `<Navigate>` performs the redirect, passing the `sessionExpired` flag via `location.state`; ensure a fresh sign-in is never blocked by the dead token (depends on T006, T007)
- [x] T009 [US1] Show the "session expired" banner in `apps/admin/src/components/auth/AuthForm.tsx` when the flag is present; the text states that unsaved edits are not restored (accepted behavior, spec Edge Cases)
- [x] T010 [US1] Extend the return-path resolution in `apps/admin/src/pages/Login.tsx` so a saved `sessionStorage` return path (from T007) wins after a fresh sign-in, still sanitized through `apps/admin/src/features/auth/redirect.ts` (open-redirect test in `require-auth.test.ts` must stay green)

**Checkpoint**: User Story 1 fully functional and testable independently.

---

## Phase 4: User Story 2 - Backend unreachable at startup (Priority: P2)

**Goal**: When the backend is unreachable at dashboard load, show an explicit "backend unreachable" state with Retry; never clear the stored session, never present it as expiry or sign-out.

**Independent Test**: Load the dashboard with the backend stopped → "backend unreachable" state with Retry, no sign-in screen, stored token intact; start the backend, Retry → dashboard without re-signing in.

### Tests for User Story 2 ⚠️ (write FIRST, ensure they FAIL)

- [x] T011 [P] [US2] Add `apps/admin/src/tests/restore.test.ts` (new, mock `me()`): a network error or 5xx during restore → status `"unreachable"` and the stored token is kept; a 401 → status `"unauthenticated"` and the token is cleared

### Implementation for User Story 2

- [x] T012 [US2] Update `restore()` in `apps/admin/src/features/auth/auth.tsx`: classify `UNAUTHORIZED` → `unauthenticated` (clear token); `NETWORK`/5xx → new status `"unreachable"` (token kept); expose `retry()` that re-runs `restore()` (add `"unreachable"` to `AuthStatus`)
- [x] T013 [P] [US2] Create `apps/admin/src/features/auth/BackendUnreachable.tsx` — explicit "backend unreachable" screen with a Retry button (FR-015 wording; must never say "session expired")
- [x] T014 [US2] In `apps/admin/src/features/auth/RequireAuth.tsx` render `BackendUnreachable` when status is `"unreachable"`; keep the expiry redirect path for every other failure (depends on T012, T013)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Hardened sign-in (Priority: P2)

**Goal**: Throttled failed sign-ins (per account and per source), uniform indistinguishable denial (401, one message, ~250 ms), no public signup, 8-char passwords, email confirmation enforced, dev-credential gate, server-observable sign-out with structured security-event logs.

**Independent Test**: Throttling after repeated failures, identical denied outcomes (wrong password vs valid non-admin), refused public sign-up, enforced password length / email confirmation, structured log records for every security event.

### Tests for User Story 3 ⚠️ (write FIRST, ensure they FAIL — TDD per server convention)

- [x] T015 [P] [US3] Create `apps/server/tests/unit/throttle.test.ts` (new): 5 failures inside the 5-minute window → blocked for ≥ 15 minutes; window roll frees a source; a successful sign-in clears the account and source counters (FR-004); block expiry releases
- [x] T016 [US3] Update `apps/server/tests/integration/auth-login.test.ts` (new assertions, FAIL first): wrong-password denial is indistinguishable from valid-but-non-admin denial (same 401 code, message, and ~250 ms delay); throttling per account and per source via `POST /api/auth/login`; dev-credential refused when `ALLOW_DEV_CREDENTIAL=false`; `POST /api/auth/logout` returns 204 for valid, invalid, and missing tokens (idempotent)

### Implementation for User Story 3

- [x] T017 [P] [US3] Create the in-memory sliding-window throttler `apps/server/src/api/throttle.ts` — `createLoginThrottler()` returning `isBlocked(key)`, `recordFailure(key)`, `clearKey(key)`; keys are lowercased email and `request.ip`; constants `MAX_FAILURES = 5`, `WINDOW_MS = 5 * 60_000`, `BLOCK_MS = 15 * 60_000` (data-model.md state transitions)
- [x] T018 [P] [US3] Create the security-event logger `apps/server/src/api/security-events.ts` — `eventLog(req, event, outcome, account)` emitting pino lines matching `specs/009-auth-quick-wins/contracts/security-events.md` (event catalog: `security.sign_in_success` / `sign_in_failure` / `sign_in_throttled` / `sign_out`; fields `account`, `source` = `request.ip`, `outcome`, `reqId`)
- [x] T019 [P] [US3] Update `supabase/config.toml` — `enable_signup = false` in `[auth]` (NOT `[auth.email]` — that flag disables the email provider, breaking existing-admin logins; verified empirically), `enable_confirmations = true`, `minimum_password_length = 8` (R3); applied with `supabase stop && supabase start` (admin login OK, public signup refused)
- [x] T020 [US3] Rework the login route in `apps/server/src/api/auth-login.ts`: throttler pre-check (throttled → unified denial + `security.sign_in_throttled` event, never reaching GoTrue) → GoTrue sign-in → every denial (wrong password, non-admin, unconfirmed email, dev-credential refused) returns the identical `401 UNAUTHORIZED "Invalid email or password"` after `DENIAL_MIN_MS = 250` (R1) → dev-credential gate comparing against the documented `DEV_CREDENTIAL` constant unless `ALLOW_DEV_CREDENTIAL=true` (R4) → `security.sign_in_success`/`sign_in_failure` events → success clears the throttler account+source keys (depends on T017, T018)
- [x] T021 [US3] Add `POST /api/auth/logout` in `apps/server/src/api/auth-login.ts` per `contracts/logout-api.md`: bearer token → best-effort `supabase.auth.admin.signOut(token, "global")` → always `204` (idempotent, no token-validity leak) → emit `security.sign_out` (account from token subject, or `"unknown"`) (depends on T018)
- [x] T022 [US3] Wire the throttler per app instance in `apps/server/src/api/index.ts` (instantiate inside `registerAuth` so each `buildApp` gets a fresh instance — test isolation); confirm `logger: true` (already set in `buildApp`, `apps/server/src/api/app.ts`) so security-event lines emit (depends on T017)
- [x] T023 [US3] Set `ALLOW_DEV_CREDENTIAL=true` in `apps/server/.env` (local only, gitignored) and mirror the new vars in `apps/server/.env.example` (create if missing) (depends on T003)

**Checkpoint**: User Stories 1–3 all work independently.

---

## Phase 6: User Story 4 - Dashboard and backend hardening without broken workflows (Priority: P3)

**Goal**: Build-time CSP for the admin SPA, Origin allowlist on the API, and one uniform authorization rule (the future RBAC seam) — with zero regressions to existing workflows.

**Independent Test**: Injected script is blocked; a foreign-origin request is refused; revoking an administrator ends every action uniformly; all existing workflows still pass.

### Tests for User Story 4 ⚠️ (write FIRST, ensure they FAIL)

- [x] T024 [P] [US4] Extend `apps/server/tests/integration/auth-login.test.ts` (or add `origin-guard.test.ts`): a request with a foreign `Origin` header → `403` with the standard envelope; an allowed `Origin` and an absent `Origin` both pass

### Implementation for User Story 4

- [x] T025 [P] [US4] Create the Origin allowlist hook `apps/server/src/api/origin-guard.ts` — an `onRequest` hook: requests WITH an `Origin` header not in `ADMIN_ORIGINS` → `403` envelope; `OPTIONS` preflight and absent-`Origin` requests (curl, tests, native clients) pass (R5)
- [x] T026 [US4] Register the origin-guard hook in `apps/server/src/api/app.ts` immediately AFTER the CORS plugin so preflight is handled first (depends on T025)
- [x] T027 [P] [US4] Add the build-time-only CSP injection plugin to `apps/admin/vite.config.ts` — a `transformIndexHtml` plugin guarded on `mode === "production"` that emits the `<meta http-equiv="Content-Security-Policy">` from `specs/009-auth-quick-wins/contracts/csp-policy.md`, substituting `<API_ORIGIN>` from `VITE_API_URL`; dev keeps no CSP (R6)
- [x] T028 [US4] Extract the shared `isAdminUserId(db, userId)` helper in `apps/server/src/api/auth.ts` (single authorization rule, FR-011); use it in the admin guard (`auth.ts`), and in the login and `/me` routes (`auth-login.ts`) — no duplicate inline lookups remain; the guard seam stays the single preHandler (depends on T020)

**Checkpoint**: All user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Glossary (Constitution Principle IV), SECURITY.md status, and full validation.

- [x] T029 [P] Add glossary entries "Sign-in Attempt" and "Security Event" to `docs/CONTEXT.md` (Principle IV requires the terms to exist in the glossary before use in code)
- [x] T030 [P] Update `docs/SECURITY.md` — mark findings E3 (dev credential), S1 (no CSP), S3 (origin check — CORS allowlist) as resolved by this feature, plus L1 (session expiry UX), L2 (server-side logout revocation), L3 (unreachable classification), R1 (single authz rule), R2 (uniform denial); note that R3 (RLS) is NOT touched and E4 (throttling) is partial (in-memory, app-level); record the `frame-ancestors` limitation (a `<meta>` CSP cannot express it; deferred to the future hosting layer, R6)
- [x] T031 Run the validation scenarios in `specs/009-auth-quick-wins/quickstart.md` end-to-end against the local Supabase stack (SC-001…SC-008)
- [x] T032 Full quality gates: `pnpm --filter server typecheck`, `pnpm --filter server test`, `pnpm --filter admin test`, `pnpm lint`, `pnpm format:check`
- [x] T033 Commit each logical group with a conventional commit (`feat(server): …`, `feat(admin): …`, `chore(config): …` — commitlint enforced by `.husky/commit-msg`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (env vars feed US3's gate and US4's allowlist)
- **User Stories (Phase 3+)**: All depend on Foundational completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1, MVP)**: Foundational only — no dependencies on other stories
- **US2 (P2)**: Foundational only — independently testable
- **US3 (P2)**: Foundational (env var) — server-side; independent of US1/US2
- **US4 (P3)**: Foundational (env var) — independent of US1/US2; T028 edits files first touched in US3, so US4 runs after US3

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation
- Implementation before integration; story complete before moving to the next priority
- **Same-file caveat**: US1 (T008) and US2 (T012) both edit `apps/admin/src/features/auth/auth.tsx`; US3 (T020/T021) and US4 (T028) both edit `apps/server/src/api/auth-login.ts`. Run those stories sequentially (or coordinate the shared file) — the [P] markers only cover different-file work.

### Parallel Opportunities

- T002, T003: independent of each other (after T001)
- US1 + US2 test batches (T004+T005, T011): all different files — can run in parallel
- US1 impl T006, US3 impl T017–T019, US4 impl T025/T027: different files — can run in parallel across stories
- Every `[P]` task inside a phase is a separate file with no dependency on incomplete tasks

---

## Parallel Example: Cross-story first batch

```bash
# Launch all failing tests for US1 + US2 + US3 together:
Task: "T004 require-auth.test.ts expiry flow"
Task: "T005 session-expired.test.ts interceptor"
Task: "T011 restore.test.ts classification"
Task: "T015 throttle.test.ts unit"
Task: "T016 auth-login.test.ts integration"

# Then launch independent implementation files together:
Task: "T006 sessionExpired.ts bus"
Task: "T017 throttle.ts throttler"
Task: "T018 security-events.ts logger"
Task: "T019 config.toml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003 — CRITICAL, blocks all stories)
3. Complete Phase 3: User Story 1 (T004–T010)
4. **STOP and VALIDATE**: `pnpm --filter admin test` — expiry flow green
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test independently → **MVP**
3. US2 → test independently (restore classification)
4. US3 → test independently (server TDD red→green, `pnpm --filter server test`)
5. US4 → test independently (origin + CSP + uniform rule, zero regressions)
6. Polish: glossary, SECURITY.md, quickstart, full gates

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (admin expiry UX)
   - Developer B: US2 (admin unreachable UX) — coordinate `auth.tsx` with A
   - Developer C: US3 (server hardening)
   - Developer D: US4 (origin guard, CSP, auth-rule extraction) — starts after US3's `auth-login.ts` edits
3. Stories integrate independently; final merge runs Phase 7 gates

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps the task to its spec.md user story for traceability
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group (conventional commits)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts (see the US1/US2 and US3/US4 caveats), cross-story dependencies that break independence
