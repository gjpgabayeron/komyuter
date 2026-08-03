# Research: Admin Application Shell

Phase 0 output for `specs/005-admin-appshell`. Each unknown from the plan's Technical Context and each CLI/tooling choice is resolved here as `Decision → Rationale → Alternatives considered`.

## R1. Scaffold command for a Vite + React app in the monorepo

- **Decision**: Scaffold with the official Vite CLI into the existing workspace path, then complete tooling with the shadcn CLI: `pnpm create vite@latest apps/admin --template react-ts`, then `pnpm install`; then `pnpm add -D tailwindcss @tailwindcss/vite vitest @vitest/...`, add the tailwind plugin to `vite.config.ts`; then `pnpm dlx shadcn@latest init` (Base UI, new-york, Tailwind v4, aliases `@/components`, `@/lib`) and `pnpm dlx shadcn@latest add button input label dropdown-menu avatar tooltip separator sonner badge card skeleton`.
- **Rationale**: The user explicitly prefers CLI install scripts over hand-written files. `create vite` reproduces the proven `apps/web` pattern, and `shadcn init/add` generates the component primitives (no manual `components/ui/*` authoring). The shadcn CLI's Base UI default matches the brief ("Shadcn Base UI").
- **Details**: `npx shadcn@latest create --template vite` exists and scaffolds a complete Vite + React 19 + Tailwind 4 + Base UI app in one shot, but it targets React 19 + Vite 6 and creates a standalone project. We intentionally use the two-step path to pin React/Vite to the repo's versions (R2) while still driving everything through CLIs.
- **Alternatives considered**: `npx shadcn@latest create --template vite` in one shot (rejected: forces React 19/Vite 6 and an outer standalone layout, diverging from repo conventions); fully manual file authoring (rejected: violates the user's CLI preference).

## R2. React / Vite / TypeScript versions (plan Technical Context NEEDS CLARIFICATION)

- **Decision**: **React 18.3 + Vite 5 + TypeScript 5.5.4**, matching `docs/ADMIN.md` §3 and the existing `apps/web` / `packages/ui` pinning. Base UI (`@base-ui/react`) is verified compatible with React 18.x, so shadcn's Base UI components generate and run without React 19.
- **Rationale**: Constitution Principle III (extend shared config, follow repo conventions) and the admin rebuild contract in `docs/ADMIN.md` both name React 18.3 + Vite 5. Keeping one React major across `web`, `ui`, `mobile`-adjacent packages and `admin` avoids dual-React confusion in the monorepo and keeps the root shared configs (TS 5.5, ESLint 9) valid as-is.
- **Risk guard**: If, during implementation, a generated Base UI component turns out to depend on a React 19-only API, the fallback is to bump only `apps/admin` to React 19 — a contained, documented change to that app's `package.json`. The shared `@repo/typescript-config/vite.json` is version-agnostic and needs no change.
- **Alternatives considered**: React 19 + Vite 6 (shadcn's current template default; rejected for repo consistency, R1); React 18.2 exact (matches `apps/web`, but ADMIN.md documents 18.3).

## R3. Styling and design tokens

- **Decision**: Tailwind CSS v4 via `@tailwindcss/vite`; port the `docs/ADMIN.md` Appendix E token set into `src/index.css` using Tailwind v4 `@theme`, applied to the Route Sign grammar: pure white ground, signboard green-blue (primary/actions) + signal amber (attention only), sharp ≤4px corners on plates, pill radius for interactive controls, no shadows, no state conveyed by color alone.
- **Rationale**: Tailwind 4 is the current shadcn default and is already the documented admin stack; `@tailwindcss/vite` is the v4-recommended Vite integration. Tokens are the exact HSL set ADMIN.md already defines (`--primary`, `--hail`, `--approach`, `--warning`, etc.), so the design contract is preserved.
- **Alternatives considered**: Tailwind 3 + `postcss` config (older, more config surface; rejected); CSS modules (rejected: shadcn/Tailwind assumption).

## R4. Authentication flow (spec FR-001, FR-002, FR-008; ADR-0006; user directive 2026-08-03)

- **Decision**: **Backend-proxied login.** The admin web app never talks to the identity service directly. Sign-in posts credentials to a new public Fastify endpoint `POST /api/auth/login`, which uses the existing `deps.supabase` client (`supabase.auth.signInWithPassword`), verifies the signer is in `admin_users`, and returns `{ success: true, data: { access_token, user: { id, email } } }`. The admin app stores the `access_token` and sends it as `Authorization: Bearer <token>` on all `/api/admin/*` calls — the existing guard (`src/api/auth.ts`) already validates these tokens via `supabase.auth.getUser(token)`.
- **Rationale**: Explicit user directive to use the existing backend API for auth. It centralizes auth behind the documented envelope/guard architecture, lets login distinguish "invalid credentials" (401 UNAUTHORIZED) from "signed in but not an admin" (403 FORBIDDEN) before any token is issued, keeps Supabase keys off the browser, and reuses the guard exactly as built. ADR-0006 (no DIY JWT) holds: the token is issued by the identity service and merely proxied.
- **Session restore**: `GET /api/auth/me` (reuses the guard's token validation + `admin_users` check) returns the admin identity on app load so a stored token can be validated without a full re-login. **Sign-out**: the client discards the stored token (tokens are stateless JWTs; there is no server-side revocation in this feature).
- **Caveat**: `signInWithPassword` against a service-role client is normally accepted by GoTrue; if the local stack rejects it, create a dedicated anon-key sign-in client in `apps/server/src/config/supabase.ts` (env addition) and use it only in the login route. Guarded endpoints keep using the existing client.
- **Error contract**: `401 { code: "UNAUTHORIZED", message }` for wrong credentials; `403 { code: "FORBIDDEN", message }` for non-admin; both in the standard envelope (`apps/server/src/api/errors.ts`).
- **Alternatives considered**: supabase-js in the browser for sign-in (rejected per user directive; ADMIN.md's §3 table is superseded by this decision); opaque app session instead of the raw token (rejected — more work now, user chose the token-passthrough path).

## R5. Routing model (spec FR-003…FR-010)

- **Decision**: `react-router-dom` 6 with a `router.tsx` route table: `/login` is public; `/`, `/routes`, `/routes/:routeId`, `/fares`, `/export` live under a `RequireAuth`-guarded layout that renders `AppShell` (ConnectionBanner + NavRail + Header + `<Outlet/>`); a `*` catch-all renders `NotFound` inside the shell. The section registry (`lib/sections.ts`) is the single source for nav order, labels, paths, and icons; Header derives its title from the active route.
- **Rationale**: Matches the documented admin stack (`react-router-dom` 6) and the target architecture (ADMIN.md §10.1). One registry prevents nav list, header title, and route config from drifting apart.
- **Alternatives considered**: Flat conditional rendering without a router (rejected: no deep links, no back/forward, violates FR-007/FR-008); a custom router (rejected: reimplementation).

## R6. Offline banner signal (spec FR-011; Clarification Q3)

- **Decision**: Detect connectivity with browser network events only — a small `useOnline()` hook listening to `window` `online`/`offline` — rendered by `ConnectionBanner` at the top of the shell.
- **Rationale**: Clarification Q3 chose browser-network-events only for this step; there are no admin API calls in the shell to heartbeat against. This is dependency-free and works even when the backend is unreachable for reasons other than transport.
- **Alternatives considered**: API heartbeat to `/api/status` (deferred to a later phase when real sections introduce API calls); both signals (deferred).

## R7. Toast feedback (spec FR-015)

- **Decision**: `sonner` via the shadcn sonner wrapper; toasts are fired from the auth provider on successful sign-in, sign-out, and on sign-in/sign-out errors.
- **Rationale**: shadcn's Tailwind v4 guidance deprecates its toast component in favor of sonner, and `docs/ADMIN.md` already lists sonner as the admin toast library.
- **Alternatives considered**: shadcn toast (deprecated per current docs); a hand-rolled toaster (reimplementation).

## R8. UI state (nav rail collapse, spec FR-010)

- **Decision**: `zustand` store (`lib/uiStore.ts`) holding a `collapsed: boolean`; in-memory only — no persistence middleware. Collapsed state therefore survives section changes and same-session refreshes lose it only on a hard page load of the SPA entry (acceptable per FR-010 "within a session"; the tab keeps the store alive across client-side navigation).
- **Rationale**: `zustand` is the documented admin UI-state choice (ADMIN.md §3). FR-010 requires stability across section changes and refreshes within a session; a plain store satisfies it and avoids premature persistence.
- **Alternatives considered**: React context (rejected: churn for a leaf UI flag, documented stack already uses zustand); `zustand` + `persist` middleware (deferred: cross-session persistence is a plan-level nicety, not in spec).

## R9. Testing strategy (spec SC-001…SC-010)

- **Decision**: Vitest for `apps/admin`; unit-test the pure helpers (`lib/sections.ts` registry, auth-gate redirect logic, `useOnline` reducer) in `apps/admin/src/tests/`. Add a `test` task for `admin` to `turbo.json` (constitution PATCH 2026-07-31 permits per-app Vitest tasks).
- **Rationale**: Principle V demands measurable, independently verifiable outcomes; pure helpers are cheap to test and cover the trickiest logic (redirect/returnTo, section→title mapping). Reviewer-based SCs remain the primary UX verification in `quickstart.md`.
- **Alternatives considered**: Full component/integration testing with Testing Library (worthwhile later, but out of scope for a shell whose risk is concentrated in a few pure functions); no tests (rejected: constitution).

## R10. Repo gate wiring (engineering workflow gates)

- **Decision**: Add `apps/admin/**/*.{ts,tsx}` to the `webUiFiles` glob in the root `eslint.config.mjs` (browser globals + react-hooks/react-refresh apply), add `tsc --noEmit -p apps/admin/tsconfig.json` to the root `typecheck` script, and add the `test` task for `admin` in `turbo.json`. The app's own `package.json` scripts: `dev`, `build` (`tsc && vite build`), `preview`, `test` (`vitest run`).
- **Rationale**: Constitution Engineering Workflow — a single root ESLint flat config and a root typecheck are non-negotiable; extending them is required, recreating per-package lint config is forbidden.
- **Alternatives considered**: A per-package ESLint config (forbidden by constitution); leaving admin out of root gates (would make quality gates meaningless).

## R11. Env contract (development-mode fallback, spec SC-010)

- **Decision**: `apps/admin/.env` requires **`VITE_API_URL`** (base URL of the Fastify backend — used for auth and all future admin API calls). `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are **no longer required by the admin app** (auth is backend-proxied, R4); they may be left in a local `.env` but are removed from `.env.example`. No map tokens are required for this feature. The shell must render with the backend unreachable: the login form and shell render, sign-in fails with an honest error toast, and the connection banner may appear.
- **Rationale**: SC-010 requires the shell to function standalone; the constitution's Precision Is Trust forbids fabricating auth success when the backend is unreachable, so degraded behavior is an explicit, honest error.
- **Alternatives considered**: Requiring a live backend to view the shell (rejected: violates SC-010); keeping the Supabase browser keys for a direct fallback (rejected: contradicts the R4 decision to keep identity keys off the browser).

## R12. Backend login endpoint shape and testing (server TDD gate)

- **Decision**: New public endpoints on `apps/server`:
  - `POST /api/auth/login` — body `{ email, password }` (zod schema from `@komyuter/shared` where the shared package owns it, else local schema mirroring the shared conventions); response `{ success: true, data: { access_token, user: { id, email } } }`. Registered **outside** the admin guard (public), alongside the existing `registerStatus`.
  - `GET /api/auth/me` — Bearer token; reuses the guard's `supabase.auth.getUser` + `admin_users` check; returns `{ success: true, data: { id, email } }`.
- **Testing**: Per the server TDD convention in `AGENTS.md`, integration tests are written **first** in `apps/server/tests/integration/auth-login.test.ts` (using `tests/integration/helpers.ts` + `buildApp`) covering: valid admin credentials → access token + identity; wrong credentials → 401; valid non-admin user → 403; `/me` with valid/invalid token. Gate: `pnpm --filter server typecheck` and `pnpm --filter server test` (requires local Supabase stack + `apps/server/.env`).
- **Rationale**: Matches the established `{ success, data | error }` envelope, error codes (`UNAUTHORIZED`/`FORBIDDEN`), and the `buildApp({ db, supabase })` DI pattern already in the codebase (`src/api/app.ts`).
- **Alternatives considered**: Reusing a Supabase browser client to sign in and only using the backend for `/api/admin/*` (rejected: R4); adding login under the existing `createAdminAuthGuard` (rejected: the guard requires a token, so a login endpoint must be public by definition).
