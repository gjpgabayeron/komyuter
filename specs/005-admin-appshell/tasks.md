# Tasks: Admin Application Shell

**Input**: Design documents from `/specs/005-admin-appshell/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-shell.md, contracts/auth-api.md, quickstart.md
**Tests**: Minimal unit tests for pure helpers (section registry, auth-gate redirect, session logic) are included per `plan.md` research R9; server auth endpoints are developed test-first (TDD) per the server quality gates in `AGENTS.md`.
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- All paths are relative to the repo root (`apps/admin/...`, `apps/server/...`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the `apps/admin` app (currently only `.env` exists) and wire it into the monorepo gates.

- [x] T001 Bootstrap apps/admin from the Vite react-ts template via CLI (`pnpm create vite@latest apps/admin --template react-ts`), then `pnpm install` — scaffold replaces the empty `apps/admin/`
- [x] T002 Add runtime dependencies to `apps/admin/package.json` via `pnpm add` (react@^18.3.0, react-dom, react-router-dom@^6, @tanstack/react-query@^5, axios, @base-ui/react, zustand, lucide-react, sonner, class-variance-authority, clsx, tailwind-merge)
- [x] T003 [P] Add dev dependencies to `apps/admin/package.json` via `pnpm add -D` (vite@^5, @vitejs/plugin-react, typescript@5.5.4, tailwindcss@^4, @tailwindcss/vite, vitest, @types/react@^18, @types/react-dom@^18, @types/node)
- [x] T004 Configure `apps/admin/vite.config.ts` with the `react()` and `@tailwindcss/vite` plugins
- [x] T005 Configure `apps/admin/tsconfig.json` to extend `@repo/typescript-config/vite.json` (`jsx: react-jsx`, `include: ["src"]`)
- [x] T006 Run `pnpm dlx shadcn@latest init` inside `apps/admin` (Base UI, new-york, Tailwind v4, aliases `@/components`, `@/lib`) → generates `apps/admin/components.json` (depends T002/T003/T004)
- [x] T007 Run `pnpm dlx shadcn@latest add button input label dropdown-menu avatar tooltip separator sonner badge card skeleton` (depends T006)
- [x] T008 Create `apps/admin/index.html` (title "Komyuter Admin", `#root` div) and `apps/admin/src/vite-env.d.ts`
- [x] T009 [P] Wire repo gates: add `"apps/admin/**/*.{ts,tsx}"` to `webUiFiles` in `eslint.config.mjs`; add `tsc --noEmit -p apps/admin/tsconfig.json` to the root `typecheck` script in `package.json`; add the admin `test` task to `turbo.json`
- [x] T010 [P] Add `apps/admin/vitest.config.ts` and a `"test": "vitest run"` script to `apps/admin/package.json`
- [x] T011 Create `apps/admin/src/index.css` with Tailwind v4 `@import "tailwindcss"` plus the `@theme` Route Sign tokens from `docs/ADMIN.md` Appendix E (white ground, green-blue primary, amber warning, ≤4px corner tokens)

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared client infrastructure every user story depends on, including the backend-proxied auth client.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T012 [P] Create `apps/admin/src/lib/utils.ts` with the `cn()` helper (clsx + tailwind-merge)
- [x] T013 [P] Create `apps/admin/src/lib/sections.ts` — pure section registry (`id`, `label`, `path`, `icon`) for Overview / Routes / Fares / Export (see `data-model.md` → Application Section)
- [x] T014 [P] Create `apps/admin/src/lib/queryClient.ts` — react-query client instance
- [x] T015 [P] Create `apps/admin/src/lib/api.ts` — axios instance with `baseURL = import.meta.env.VITE_API_URL`, Bearer token injection, and `{ success, data | error }` envelope handling (see `contracts/ui-shell.md` §1)
- [x] T016 Create `apps/admin/src/features/auth/api.ts` — auth API functions over `lib/api.ts`: `login(email, password)` → POST `/api/auth/login`, `me()` → GET `/api/auth/me` (depends T015; `contracts/auth-api.md`)
- [x] T017 Create `apps/admin/src/features/auth/auth.tsx` — `AuthProvider`/`useAuth` context: `status` (`loading|unauthenticated|authenticating|authenticated`), stored token, session restore via `me()`, `signIn(email, password)`, `signOut()` (depends T016; session machine in `data-model.md`)
- [x] T018 [P] Create `apps/admin/src/components/shared/Toaster.tsx` — sonner toaster mount (depends T007)
- [x] T019 [P] Unit tests for the section registry in `apps/admin/src/tests/sections.test.ts` (id uniqueness, path→section mapping)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: Backend Auth API (apps/server) — BLOCKS US1

**Purpose**: Add the public login/me endpoints so the admin app can authenticate through the backend (Clarifications 2026-08-03; `contracts/auth-api.md`). Server tests are written FIRST (TDD gate).

**⚠️ CRITICAL**: US1 depends on these endpoints existing. Gates: `pnpm --filter server typecheck` and `pnpm --filter server test` (requires local Supabase stack + `apps/server/.env`).

- [x] T020 [P] Write server integration tests FIRST for POST /api/auth/login in `apps/server/tests/integration/auth-login.test.ts` (via `tests/integration/helpers.ts` + `buildApp`): valid admin credentials → `access_token` + admin identity; wrong credentials → 401 `UNAUTHORIZED`; signed-in non-admin → 403 `FORBIDDEN`
- [x] T021 Implement POST /api/auth/login in `apps/server/src/api/auth-login.ts` — `deps.supabase.auth.signInWithPassword` + `admin_users` check + envelope response; register it PUBLIC (outside the `/api/admin` guard) in `apps/server/src/api/index.ts` (depends T020; `contracts/auth-api.md`, research R4/R12)
- [x] T022 [P] Write server integration test FIRST for GET /api/auth/me in `apps/server/tests/integration/auth-login.test.ts`: valid Bearer token → admin identity; missing/invalid token → 401
- [x] T023 Implement GET /api/auth/me in `apps/server/src/api/auth-login.ts` — reuse the guard's validation (`supabase.auth.getUser` + `admin_users`) and return `{ id, email }` (depends T022)

**Checkpoint**: `pnpm --filter server typecheck` and `pnpm --filter server test` green; login/me round-trip verified against the local stack.

---

## Phase 4: User Story 1 - Sign in and land in the dashboard shell (Priority: P1) 🎯 MVP

**Goal**: A signed-out Administrator sees a login screen, signs in with email + password through the backend, and lands on the shell with the Overview section shown.
**Independent Test**: Open `/` signed out → login renders; submit valid credentials (backend up) → shell with nav rail + header + Overview appears (quickstart scenario 1–2; SC-001).

### Implementation for User Story 1

- [ ] T024 [US1] Create `apps/admin/src/main.tsx` — render `<App/>`, import `index.css` (depends T008/T011)
- [ ] T025 [US1] Create `apps/admin/src/app/App.tsx` — provider composition: `AuthProvider` > `QueryClientProvider` > `Toaster` > router (see `contracts/ui-shell.md` §4)
- [ ] T026 [US1] Create `apps/admin/src/app/router.tsx` — route table: public `/login`; guarded shell layout for `/`, `/routes`, `/routes/:routeId`, `/fares`, `/export` (depends T013; `contracts/ui-shell.md` §2)
- [ ] T027 [US1] Create `apps/admin/src/features/auth/RequireAuth.tsx` — guard that redirects unauthenticated users to `/login` with `state.returnTo` (FR-008)
- [ ] T028 [US1] Create `apps/admin/src/pages/Login.tsx` — email + password form (shadcn button/input/label) calling `auth.signIn`, maps 401/403 to non-technical messages, redirects to `returnTo`, success/failure toasts (FR-001, FR-002, FR-015)
- [ ] T029 [US1] Create `apps/admin/src/app/AppShell.tsx` — layout of `NavRail` + `Header` + `<Outlet/>` (FR-003)
- [ ] T030 [US1] Create `apps/admin/src/app/NavRail.tsx` — brand plate + four section links rendered from `lib/sections.ts` (basic; full active/collapse behavior in US2)
- [ ] T031 [US1] Create `apps/admin/src/app/Header.tsx` — current section title + sign-out slot (FR-005; wiring in US3)
- [ ] T032 [US1] Create `apps/admin/src/pages/Overview.tsx` — designed placeholder/empty-state page per Route Sign grammar (FR-012)
- [ ] T033 [US1] Unit tests for the RequireAuth `returnTo` redirect logic in `apps/admin/src/tests/require-auth.test.ts`

**Checkpoint**: US1 is fully functional — sign-in lands on the shell showing Overview.

---

## Phase 5: User Story 2 - Navigate between sections (Priority: P1)

**Goal**: The Administrator moves between Overview, Routes, Fares, and Export; active state + header title update, no full reload, deep links resolve.
**Independent Test**: Click each nav item and confirm content swaps, active rail item + header title update, and `/fares` deep-links render directly when signed in (quickstart scenario 3–4; SC-002, SC-004).

### Implementation for User Story 2

- [ ] T034 [US2] Create `apps/admin/src/lib/uiStore.ts` — zustand store with `collapsed` boolean for the nav rail (FR-010)
- [ ] T035 [US2] Implement NavRail active state + collapse toggle in `apps/admin/src/app/NavRail.tsx` — active state from the current route, `aria-expanded`, state conveyed by more than color (FR-006, FR-010, FR-013)
- [ ] T036 [US2] Header derives its title from the active route via the section registry in `apps/admin/src/app/Header.tsx` (FR-005)
- [ ] T037 [US2] Create `apps/admin/src/pages/RouteWorkspace.tsx` placeholder — used by both `/routes` and `/routes/:routeId` (FR-012)
- [ ] T038 [US2] Create `apps/admin/src/pages/Fares.tsx` designed placeholder (FR-012)
- [ ] T039 [US2] Create `apps/admin/src/pages/Export.tsx` designed placeholder (FR-012)
- [ ] T040 [US2] Create `apps/admin/src/pages/NotFound.tsx` + add the `*` catch-all route in `apps/admin/src/app/router.tsx`
- [ ] T041 [US2] Create shared `EmptyState` and `PageHeader` components in `apps/admin/src/components/shared/` and apply them to all four placeholder pages

**Checkpoint**: US1 and US2 both work — full navigation across four sections with active state.

---

## Phase 6: User Story 3 - Sign out (Priority: P2)

**Goal**: The Administrator signs out from anywhere; session ends, protected sections are blocked, login is returned to.
**Independent Test**: Sign out from any section → back at `/login`; protected routes reject access (quickstart scenario 5; SC-003).

### Implementation for User Story 3

- [ ] T042 [US3] Implement the Header user menu in `apps/admin/src/app/Header.tsx` — avatar + shadcn dropdown-menu with a Sign out action (depends T007/T031)
- [ ] T043 [US3] Wire `signOut()` in `apps/admin/src/features/auth/auth.tsx` — clear stored token, navigate to `/login`, success toast (FR-009, FR-015)
- [ ] T044 [US3] Handle sign-out failure when offline in `apps/admin/src/features/auth/auth.tsx` — local token cleared, honest error toast, still returns to login (spec Edge Case)
- [ ] T045 [US3] Unit tests for the session sign-out/state logic in `apps/admin/src/tests/session.test.ts`

**Checkpoint**: US1, US2, and US3 work — sign-out is reliable from any section.

---

## Phase 7: User Story 4 - Work reliably with degraded connectivity (Priority: P3)

**Goal**: An offline browser shows a connection banner; the current view keeps rendering and nothing crashes; the banner clears on reconnection.
**Independent Test**: Disconnect the network → banner appears, view renders; reconnect → banner clears (quickstart scenario 7; SC-006).

### Implementation for User Story 4

- [ ] T046 [US4] Create `apps/admin/src/lib/useOnline.ts` — hook over browser `online`/`offline` events (FR-011; research R6)
- [ ] T047 [US4] Create `apps/admin/src/components/shared/ConnectionBanner.tsx` — visible banner rendered while offline
- [ ] T048 [US4] Mount `ConnectionBanner` in `apps/admin/src/app/AppShell.tsx` so the view stays mounted beneath it (FR-011)
- [ ] T049 [US4] Login page: show the banner when offline at initial load and surface an honest error if sign-in is attempted offline (spec Edge Case)

**Checkpoint**: All four user stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Repo gates, accessibility, design fidelity, docs, and end-to-end validation across the shell.

- [ ] T050 [P] Run `pnpm lint` and fix all issues in `apps/admin`
- [ ] T051 [P] Run `pnpm typecheck` and fix all issues in `apps/admin`
- [ ] T052 [P] Run `pnpm format:check` and fix all formatting in `apps/admin`
- [ ] T053 [P] Run `pnpm --filter admin test` and fix all failures
- [ ] T054 WCAG AA pass on the shell — keyboard operability, visible focus indicators, contrast; automated check + manual review (FR-013; SC-007, SC-008)
- [ ] T055 Route Sign design polish pass per `DESIGN.md`/FR-014 — pills on controls, ≤4px corners, no shadows, amber only for attention (SC-009)
- [ ] T056 Add `apps/admin/.env.example` documenting `VITE_API_URL` (auth via backend; `contracts/ui-shell.md` §1)
- [ ] T057 Run `quickstart.md` validation scenarios 1–10; ≥ 5 reviewers for judgment-based SC-008/SC-009 (SC-001…SC-010)
- [ ] T058 [P] Update `docs/ADMIN.md` shell + auth sections if behavior diverged (backend-proxied login supersedes the §3 supabase-js row); final conventional commit (`feat(admin): …`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **Backend Auth API (Phase 3)**: Depends on Setup + Foundational; BLOCKS US1 sign-in
- **User Stories (Phase 4+)**: All depend on Foundational + Backend Auth API
  - US1 first (P1, MVP). US2/US3/US4 can then proceed in parallel (single agent: sequentially US2 → US3 → US4)
- **Polish (Final Phase)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Needs Setup + Foundational + Phase 3 login/me endpoints — the MVP slice
- **US2 (P1)**: Depends on US1 (needs the authenticated shell). Independently testable once US1 is up
- **US3 (P2)**: Depends on US1 (header + session). Independent of US2/US4
- **US4 (P3)**: Depends on US1 (AppShell mount point). Independent of US2/US3

### Within Each User Story

- Shared helpers before components
- Registry/store before the components that consume them
- Login/guard before pages that sit behind them
- Story complete before moving to the next priority

### Parallel Opportunities

- Setup: T002/T003, T006→T007 chain, T008/T009/T010/T011 are parallel where marked [P]
- Foundational: T012–T015, T018, T019 are parallel; T016 waits on T015, T017 waits on T016
- Backend Auth API: T020/T022 are parallel; T021 waits on T020, T023 waits on T022
- After US1: US2, US3, US4 are mutually independent (single agent: run sequentially)
- Polish: T050–T053, T056, T058 are parallel where marked [P]

---

## Parallel Example: User Story 1

```bash
# Run the server auth work and the client pure-logic tests together:
Task: "Write server integration tests for POST /api/auth/login"
Task: "Unit tests for the RequireAuth returnTo logic in apps/admin/src/tests/require-auth.test.ts"

# Landing page + shell scaffold together:
Task: "Create apps/admin/src/pages/Overview.tsx placeholder"
Task: "Create apps/admin/src/app/AppShell.tsx layout"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: Backend Auth API (CRITICAL — login/me endpoints)
4. Complete Phase 4: User Story 1
5. **STOP and VALIDATE**: sign in → land on shell (quickstart scenarios 1–2)
6. Commit conventionally (`feat(admin): add sign-in shell` + `feat(server): add admin login endpoint`)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Phase 3 backend auth → login/me round-trip proven against the local stack
3. US1 → sign-in + shell + Overview (MVP) → validate → commit
4. US2 → navigation, active state, deep links → validate → commit
5. US3 → sign-out → validate → commit
6. US4 → connection banner → validate → commit
7. Polish → gates, a11y, design pass, quickstart validation

### Parallel Team Strategy

With multiple developers: Setup + Foundational together; one developer on Phase 3 backend auth while another starts client-side pure helpers; after US1, one developer per US2/US3/US4; each story integrates independently.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to the spec's user story for traceability
- Each user story is independently completable and testable (see each phase's Independent Test)
- Server auth tasks (Phase 3) are test-first per the AGENTS.md server TDD gate; the tests must fail before their implementation
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
