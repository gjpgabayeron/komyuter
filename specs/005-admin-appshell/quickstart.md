# Quickstart: Admin Application Shell

Runnable validation guide for `specs/005-admin-appshell`. Proves the feature end-to-end against the success criteria in `spec.md`. Contracts and data model live in `contracts/ui-shell.md` and `data-model.md`.

## Prerequisites

- Node.js 22 LTS, pnpm 8.15.6 (repo-pinned), repository installed (`pnpm install` from root).
- `apps/admin/.env` present with `VITE_API_URL` (the Fastify backend base URL). The backend (`apps/server`) must be running with the local Supabase stack (`supabase start`) and a seeded admin account for sign-in checks; without it, SC-010 still validates the degraded path. (Auth is backend-proxied — see `contracts/auth-api.md`.)
- Branch `feat/admin`.

## Setup

```bash
pnpm install
# apps/admin bootstrap (implementation phase): create vite app, shadcn init/add, wire repo gates
# apps/server: POST /api/auth/login + GET /api/auth/me added (tests written first)
```

After bootstrap, the app + server run via the turbo pipeline:

```bash
pnpm dev                 # turbo dev across workspace; admin on its configured port, server on its own
# or scoped:
pnpm --filter admin dev
pnpm --filter server dev
```

## Quality gates (run before review)

```bash
pnpm lint                # root ESLint flat config, incl. apps/admin
pnpm typecheck           # root typecheck, incl. apps/admin
pnpm format:check        # repo prettier check
pnpm --filter admin test # vitest unit tests for pure helpers
pnpm --filter server typecheck
pnpm --filter server test  # requires local Supabase stack + apps/server/.env (auth-login tests)
```

All must pass green before the branch is reviewable.

## Validation scenarios (map to SC-001…SC-010)

| #   | Scenario          | Steps                                             | Expected outcome                                                                                                     | SC             |
| --- | ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Sign-in           | Open `/`, submit valid admin email + password     | Lands on shell, Overview shown, success toast                                                                        | SC-001         |
| 2   | Wrong credentials | Submit invalid email/password                     | Stays on login, clear non-technical error                                                                            | SC-001         |
| 3   | Navigate          | Click each of Overview / Routes / Fares / Export  | Content swaps without full reload; active rail item + header title update                                            | SC-002         |
| 4   | Deep link         | Sign out, open `/fares` directly                  | Redirected to `/login`; after sign-in lands back on Fares                                                            | SC-004         |
| 5   | Sign out          | From any section, choose sign-out                 | Returns to `/login`; protected sections blocked                                                                      | SC-003         |
| 6   | Collapse          | Toggle rail, change sections, client-side refresh | Collapsed state persists within session                                                                              | SC-005         |
| 7   | Offline           | Sign in, disable network                          | Banner appears; view keeps rendering; re-enable → banner clears                                                      | SC-006         |
| 8   | Keyboard          | Tab through nav, sign-out, collapse, login fields | Every control reachable, visible focus indicator                                                                     | SC-007         |
| 9   | A11y/design       | Automated contrast check + visual review          | WCAG AA contrast; Route Sign grammar (white ground, green-blue/amber, ≤4px corners, no shadows, no color-only state) | SC-008, SC-009 |
| 10  | No backend        | Run with no reachable auth service                | Shell + login + banner still render; sign-in fails honestly                                                          | SC-010         |

Reviewers: run scenarios 1–10 with ≥ 5 people for the judgment-based checks (SC-008, SC-009).
