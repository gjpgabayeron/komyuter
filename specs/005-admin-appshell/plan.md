# Implementation Plan: Admin Application Shell

**Branch**: `feat/admin` (spec `005-admin-appshell`) | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-admin-appshell/spec.md`

## Summary

Bootstrap the `apps/admin` dashboard (currently an empty directory with only `.env`) as a Vite + React + TypeScript app and deliver the application shell: sign-in gate (email + password, proxied through a small new login endpoint on the existing `apps/server` Fastify backend), a persistent collapsible nav rail (Overview, Routes, Fares, Export), a header with section title + sign-out, an offline connection banner driven by browser network events, sonner toasts, and four designed placeholder/empty-state pages. Everything mounts under a single strict-TS monorepo app wired into the repo's root lint/typecheck/format gates; the backend gains public `POST /api/auth/login` and `GET /api/auth/me` endpoints (tests written first per the server TDD gate).

Component primitives are generated with the shadcn CLI on Base UI (the current shadcn default library), matching the user's explicit preference for install commands over hand-written files. Visual work follows the Route Sign grammar from `DESIGN.md` / `ADMIN.md` Appendix E.

## Technical Context

**Language/Version**: TypeScript 5.5.4 (repo-pinned) strict via `@repo/typescript-config/vite.json`; React 18.3 + Vite 5 (repo convention per `docs/ADMIN.md` §3). NEEDS CLARIFICATION: confirm Base UI (via shadcn) components are compatible with React 18.3 in this repo (resolved in research.md R2).

**Primary Dependencies**: Admin app — react, react-dom; react-router-dom 6; @tanstack/react-query 5; axios (auth + API client); @base-ui/react + shadcn-style wrappers (`components/ui/*`); tailwindcss 4 + `@tailwindcss/vite`; cva, clsx, tailwind-merge; zustand (nav-rail state); lucide-react (icons); sonner (toasts). Dev: vite 5, @vitejs/plugin-react, vitest, typescript 5.5.4. Backend — reuse existing `deps.supabase` (service-role client) for a new public login endpoint; no new server dependency.

**Storage**: None. Client-only shell; the auth session is persisted by the Supabase client's default storage adapter. No server persistence in this feature.

**Testing**: Vitest for `apps/admin` (unit tests for pure helpers: section registry, nav model, auth-gate redirect logic). A `test` task is added to `turbo.json` for the admin app (permitted by the constitution PATCH 2026-07-31).

**Target Platform**: Modern evergreen desktop browsers (Chrome/Firefox/Edge/Safari, latest two majors). The admin is a desk tool.

**Project Type**: Web application (SPA frontend) inside the existing pnpm monorepo.

**Performance Goals**: Section switching perceived as instant (<200 ms); shell and login interactive within 2 s on a local dev connection; no network round-trip on navigation.

**Constraints**: Strict TS via shared config (extend, never redefine); single root ESLint flat config (extend `webUiFiles` to include `apps/admin`); repo prettier `format:check`; Route Sign grammar (pure white ground, green-blue/amber, ≤4px corners, pills for controls, no shadows, no state by color alone); admin auth proxied through the backend API (login/me endpoints added to `apps/server`, tests written FIRST per the server TDD gate in AGENTS.md); dev runs with no map tokens; no ETA anywhere (ADR-0009); auth only via Supabase through the backend (ADR-0006, no DIY JWT).

**Scale/Scope**: One shell, four placeholder sections, one admin role. Trivial concurrency (single operator). No mobile/responsive breakpoint targets beyond graceful desktop narrowness.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                                                                                                                                             | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Precision Is Trust — no fabricated values; offline banner and toasts state exactly what is known                                                              | PASS   |
| II. Recorded Decisions Govern — reconciled with ADR-0006 (Supabase Auth), ADR-0009 (no ETA), ADMIN.md stack (React 18 + Vite 5 + Base UI wrappers)               | PASS   |
| III. Shared, Never Reimplemented — extends `@repo/typescript-config/vite.json`; extends the single root ESLint flat config; no per-package lint config recreated | PASS   |
| IV. Canonical Language — Administrator, Application Section, Session used consistently                                                                           | PASS   |
| V. Measurable Deliverables — SC-001…SC-010 are measurable and reviewer-verifiable                                                                                | PASS   |
| Engineering Workflow — admin wired into root `typecheck` + root ESLint globs; `format:check` respected; Vitest `test` task permitted by constitution PATCH       | PASS   |
| UI work — `PRODUCT.md` and `DESIGN.md` loaded; Route Sign grammar applied                                                                                        | PASS   |
| Complexity — no uncomplicated-alternative rejection required                                                                                                     | PASS   |

No violations. Complexity Tracking intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-admin-appshell/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/admin/
├── index.html               # entry html (root div, title "Komyuter Admin", fonts)
├── package.json             # name "admin", workspace deps, scripts (dev/build/preview/test)
├── vite.config.ts           # react + @tailwindcss/vite plugins, dev proxy if needed
├── tsconfig.json            # extends @repo/typescript-config/vite.json, jsx react-jsx
├── components.json          # shadcn config (Base UI, new-york, aliases @/components, @/lib)
├── vitest.config.ts         # vitest unit config
├── .env                     # exists (gitignored): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
└── src/
    ├── main.tsx             # render <App/>; import index.css
    ├── index.css            # Tailwind v4 @import + @theme design tokens (Route Sign grammar)
    ├── vite-env.d.ts
    ├── app/
    │   ├── App.tsx          # providers: AuthProvider > QueryClientProvider > Toaster > Router
    │   ├── AppShell.tsx     # ConnectionBanner + NavRail + Header + <Outlet/>
    │   ├── NavRail.tsx      # collapsible rail: brand plate + section links + collapse toggle
    │   ├── Header.tsx       # current section title + user menu (sign out)
    │   └── router.tsx       # route table: /login public; /, /routes, /routes/:routeId, /fares, /export guarded
    ├── pages/
    │   ├── Login.tsx        # email + password form, error state, returnTo deep-link
    │   ├── Overview.tsx     # designed placeholder page
    │   ├── RouteWorkspace.tsx # placeholder covering /routes + /routes/:routeId
    │   ├── Fares.tsx        # designed placeholder page
    │   ├── Export.tsx       # designed placeholder page
    │   └── NotFound.tsx     # 404 within the shell
    ├── features/auth/
    │   ├── api.ts            # auth API client: login/me/logout calls (axios → backend)
    │   ├── auth.tsx          # AuthProvider/AuthContext: session, signIn, signOut, loading
    │   └── RequireAuth.tsx   # guard: redirect to /login with returnTo
    ├── components/ui/       # shadcn-generated Base UI wrappers (button, input, label,
    │   │                    #   dropdown-menu, avatar, tooltip, separator, sonner, badge, card, skeleton)
    ├── components/shared/
    │   ├── ConnectionBanner.tsx  # online/offline via browser events
    │   ├── PageHeader.tsx
    │   ├── EmptyState.tsx
    │   └── Toaster.tsx      # sonner toaster mount
    ├── lib/
    │   ├── api.ts            # axios instance: baseURL VITE_API_URL, Bearer injection, envelope handling
    │   ├── utils.ts         # cn() (clsx + tailwind-merge)
    │   ├── sections.ts      # pure section registry (id, label, path, icon)
    │   ├── uiStore.ts       # zustand: nav rail collapsed (in-memory)
    │   └── queryClient.ts   # react-query client
    └── tests/               # vitest unit tests (pure helpers)
```

Backend addition (small, public auth surface on the existing `apps/server`):

```text
apps/server/
├── src/api/
│   ├── auth-login.ts        # NEW: POST /api/auth/login, GET /api/auth/me (public; uses deps.supabase)
│   └── index.ts             # register auth-login OUTSIDE the admin guard; keep guard on /api/admin/*
└── tests/
    ├── integration/
    │   └── auth-login.test.ts  # NEW: written FIRST (TDD), covers login success/401/403 + /me
    └── unit/                    # existing unit tests unchanged

**Structure Decision**: One app (`apps/admin`) following the exact monorepo pattern already proven by `apps/web` (Vite 5, TS via `@repo/typescript-config/vite.json`, `src/` with `main.tsx` + `index.css`). The feature-internal layout (`app/`, `pages/`, `features/`, `components/`, `lib/`, `tests/`) mirrors the target architecture documented in `docs/ADMIN.md` §10.1, so later rebuild phases slot in without restructuring the shell.

## Complexity Tracking

No violations were recorded in the Constitution Check, so this section is intentionally empty per the template guidance.
```
