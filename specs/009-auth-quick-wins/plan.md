# Implementation Plan: Auth Quick Wins

**Branch**: `009-auth-quick-wins` | **Date**: 2026-08-10 | **Spec**: [specs/009-auth-quick-wins/spec.md](spec.md)

**Input**: Feature specification from `/specs/009-auth-quick-wins/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Harden the admin authentication for the thesis: a unified, indistinguishable
sign-in denial (FR-005), throttling of failed attempts per account and per source
(FR-003/004), Supabase config enforcement of no-self-signup, 8-char passwords, and
email confirmation (FR-006/007/008), a dev-credential gate (FR-012), an Origin
allowlist (FR-010), a build-time CSP for the admin SPA (FR-009), a server-observed
sign-out that revokes the session (FR-014), structured security-event logs
(FR-014/SC-007), and client UX for session expiry vs backend unreachability
(FR-001/002/015) — all while keeping the single uniform authorization seam
(FR-011). No new database entities (Q2); throttling is in-memory (single Fastify
instance, ADR-0005). RBAC is deferred per the user's decision (spec Q3) — this
feature only guarantees the seam.

## Technical Context

**Language/Version**: TypeScript 5.x strict via `@repo/typescript-config`
(`strict: true`); Node ≥ 20.12 (server uses `process.loadEnvFile`); pnpm 8.15.6.

**Primary Dependencies**:

- Server: Fastify v5, `@fastify/cors`, `@fastify/type-provider-zod` (zod schemas),
  `@supabase/supabase-js` 2.111 (service-role client), drizzle-orm 0.36, pino
  (Fastify's built-in logger).
- Admin SPA: React 18.3, Vite 5.4, react-router-dom 6, `@tanstack/react-query` 5,
  axios, zustand, sonner, maplibre-gl 5.24 + react-map-gl 8.1.

**Storage**: PostgreSQL/PostGIS (drizzle) for domain data; identities + credentials
in Supabase GoTrue (`auth.users`); `admin_users` holds the binary admin grant.
**New state**: in-memory throttler (heap of the single Fastify instance, no DB);
security events → structured pino logs (no DB).

**Testing**: Vitest. `pnpm --filter server test` (unit + integration, TDD — tests
written first per `specs/001` tasks.md), `pnpm --filter admin test` (unit),
`pnpm --filter server typecheck`, `pnpm lint` (single root ESLint 9 flat config).

**Target Platform**: local dev — Fastify API on `:3000`, admin SPA (Vite dev) on
`:5173`, local Supabase stack (`supabase start`). Production: static Vite build
(no in-repo hosting layer — CSP is injected at build time for any host).

**Project Type**: web application (admin SPA + Fastify API; mobile out of scope).

**Performance Goals**: login denials uniform ≈ 250 ms (timing
indistinguishability, FR-005); throttler ops O(1) amortized per attempt; no
measurable impact on admin CRUD.

**Constraints**: no Redis (ADR-0005) → throttler must be in-memory single-instance;
no new DB tables (Q2); responses always `{ success, data | error }`; no refresh
tokens stored client-side (token expiry must be a UX state, not silent refresh);
`enable_confirmations = true` requires `supabase stop && supabase start`.

**Scale/Scope**: 1 admin SPA + 1 Fastify instance; ~6 admin auth flows; single
deployment; local thesis scale.

## Constitution Check

_GATE: Passed before Phase 0 research; re-checked after Phase 1 design — still
passes._

| Principle                                                                                                                                                                                              | Status                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| I — Shared-first, never reimplement: throttle/security-event logic is server-internal; the only cross-package contract is the HTTP envelope, reused as-is                                              | ✅ no violation                             |
| II — Documentation as contract: spec.md, research.md, data-model.md, contracts/, quickstart.md all live in `specs/009-auth-quick-wins/`                                                                | ✅ no violation                             |
| III — Everything documented is canonical: config.toml values, constants, env vars, and CSP policy each have exactly one home                                                                           | ✅ no violation                             |
| IV — Canonical naming in docs & code: new concepts "Sign-in Attempt" and "Security Event" get `docs/CONTEXT.md` glossary entries as part of implementation (Principle IV requires addition before use) | ✅ compliant — glossary task included below |
| V — Measurable acceptance: every requirement carries SC-001…SC-008; quickstart.md maps scenarios → SCs                                                                                                 | ✅ no violation                             |
| VI — Test strategy: Vitest per amendment; server tests TDD-first; no new test infra                                                                                                                    | ✅ no violation                             |

No violations → **Complexity Tracking** below remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-auth-quick-wins/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — decisions R1–R9, grounded file:line evidence
├── data-model.md        # Phase 1 output — Sign-in Attempt, Security Event, rules
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output
│   ├── login-api.md         # POST /api/auth/login — unified denial contract
│   ├── logout-api.md        # POST /api/auth/logout — idempotent revocation
│   ├── security-events.md   # structured log line schema + event catalog
│   └── csp-policy.md        # production CSP for the admin SPA
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/server/src/
├── api/
│   ├── app.ts               # buildApp — register Origin guard hook after CORS (FR-010)
│   ├── auth.ts              # guard — use shared isAdminUserId (FR-011); keep one preHandler seam
│   ├── auth-login.ts        # login: throttler check → GoTrue → unified denial + DENIAL_MIN_MS delay,
│   │                        #   dev-credential gate (FR-012), /me via shared helper,
│   │                        #   + POST /api/auth/logout (revoke via admin.signOut, FR-014)
│   ├── throttle.ts          # NEW createLoginThrottler() — in-memory sliding window (FR-003/004)
│   ├── security-events.ts   # NEW eventLog(req, event, outcome, account) — structured pino lines (FR-014)
│   ├── origin-guard.ts      # NEW origin allowlist onRequest hook (FR-010)
│   └── index.ts             # registerAdminRoutes — instantiate throttler per app instance
├── config/
│   └── env.ts               # + ALLOW_DEV_CREDENTIAL (default false), ADMIN_ORIGINS (default localhost:5173…)
└── index.ts                 # (no change — logger: true already set in buildApp; pino lines emit as-is)
apps/server/tests/
├── unit/
│   ├── throttle.test.ts     # NEW — window/block/clear unit tests (FR-003/004)
│   └── env.test.ts          # NEW — ALLOW_DEV_CREDENTIAL/ADMIN_ORIGINS defaults (no unit env test exists today)
└── integration/
    ├── auth-login.test.ts   # UPDATE — unified denial (401 both cases), throttling, logout, origin 403,
    │                        #   dev-credential gate (tests written FIRST — TDD)
    └── helpers.ts           # (unchanged; already creates confirmed users, uses .env dev credential)

supabase/
├── config.toml              # enable_signup=false ([auth] — refuses public signups), enable_confirmations=true, minimum_password_length=8 (keep [auth.email] enable_signup=true so existing admin email logins stay enabled)
└── seed.sql                 # (unchanged — admin already email_confirmed_at; DEV_CREDENTIAL constant mirrors it)

apps/admin/src/
├── App.tsx                    # (already wired) AuthProvider > QueryClientProvider > BrowserRouter — provider sits ABOVE the router (see Architecture)
├── lib/
│   └── api.ts                 # + axios response interceptor: 401-with-token → save return path + clearStoredToken() + emitSessionExpired();
│                              #   signOut calls POST /api/auth/logout (best-effort, L2)
├── components/
│   ├── auth/
│   │   ├── AuthForm.tsx       # + "session expired" banner (FR-001); FORBIDDEN copy branch dies once login denials are uniform 401 (R2)
│   │   └── BrandPanel.tsx     # (unchanged — login side panel)
│   └── shared/
│       ├── Plate.tsx · NoticePlate.tsx  # refactor-extracted primitives — reused by BackendUnreachable + banners (Route Sign grammar)
│       └── ConnectionBanner.tsx         # existing offline banner on Login (offline ≠ "unreachable" — US2 keeps them distinct)
├── features/auth/
│   ├── auth.tsx               # AuthProvider/useAuth — restore() classifies: 401→unauthenticated; NETWORK/5xx→unreachable (token kept); retry();
│   │                          #   sessionExpired subscription flips status only — the provider NEVER navigates (RequireAuth redirects)
│   ├── api.ts                 # login()/me() (existing — consumer of the envelope + token storage in lib/api.ts)
│   ├── RequireAuth.tsx        # + "unreachable" status → BackendUnreachable; its existing declarative <Navigate> IS the expiry
│   │                          #   redirect (returnTo via location.state — no imperative navigation anywhere)
│   ├── redirect.ts            # getReturnPath — also sanitizes the sessionStorage return path (open-redirect guard stays green)
│   ├── session.ts             # (unchanged — initials/display-name helpers)
│   ├── sessionExpired.ts      # NEW tiny subscribe/emit bus (keeps lib/api.ts router-free)
│   └── BackendUnreachable.tsx # NEW full-bleed screen + Retry button (FR-015) — rendered by RequireAuth, outside the app shell
├── pages/
│   └── Login.tsx              # (already wired) consumes useAuth().signIn; + sessionExpired flag → banner; sessionStorage return path wins
└── vite.config.ts             # + build-time-only CSP injection plugin (mode === "production", FR-009)

docs/
├── CONTEXT.md               # + glossary: "Sign-in Attempt", "Security Event"
└── SECURITY.md              # + resolve-status update for E3, S1, S3, L1, L2, L3, R1, R2 (R3 is RLS — untouched; E4 partial — in-memory throttler); frame-ancestors limitation note
```

**Structure Decision**: Monorepo apps (`apps/server`, `apps/admin`) with the
existing package layout; the feature adds three small server modules, two new
admin modules (`features/auth/sessionExpired.ts`, `features/auth/BackendUnreachable.tsx`),
config edits, and tests — no new packages, no shared-package changes
(contract is the HTTP envelope, unchanged shape). RP/pattern: keep the existing
`buildApp({ db, supabase })` injection; the throttler is instantiated per app
instance inside route registration so tests get a fresh instance per `buildApp`.

### Architecture alignment (post-refactor codebase)

The admin app was rebuilt under `specs/008-admin-route-workspace-refactor`
(ADR-0014, merged before this plan). The structure sketch above reflects the
tree as it exists today, not the pre-refactor layout:

- **Provider pattern**: auth state lives in the `AuthProvider` context
  (`features/auth/auth.tsx`) with a `useAuth()` hook; `App.tsx` wires it ABOVE
  `QueryClientProvider` and `BrowserRouter`. This mirrors the house
  feature-scoped provider shape the workspace uses (`RouteWorkspaceProvider` +
  `useRouteWorkspace`).
- **The provider never navigates**: because `AuthProvider` sits above the
  router, `useNavigate` is unavailable there — and it isn't needed. US1's expiry
  flow is declarative: the `lib/api.ts` interceptor clears the token and emits
  `sessionExpired`; the provider flips status to `unauthenticated`;
  `RequireAuth`'s existing `<Navigate to="/login">` (already passing `returnTo`
  via `location.state`) performs the redirect. No `BrowserRouter` reordering, no
  `window.location`, no imperative navigation — tasks.md T008 is worded this way.
- **Three-column workspace / floating UI do not host auth UX**: the workspace
  (`pages/RouteWorkspace.tsx` → `RouteWorkspaceProvider` → `WorkspaceColumns`
  over a full-bleed MapLibre canvas) is route-editing only. `Login` and the new
  `BackendUnreachable` screen are full-bleed pre-workspace plates, rendered
  outside the `AppShell` + `NavRail` shell — `RequireAuth` wraps the shell in
  `app/router.tsx`, so expiry/unreachable states render shell-free.
- **Shared plate primitives**: `components/shared/Plate.tsx` /
  `NoticePlate.tsx` (extracted during the refactor) are the Route Sign grammar
  for the new screens and banners; `ConnectionBanner` already distinguishes
  offline on `Login` — US2's "unreachable" state is separate (token kept, never
  presented as "expired").

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations — this section is intentionally empty.
