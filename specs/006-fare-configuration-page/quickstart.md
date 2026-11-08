# Quickstart: Fare Configuration Page

Runnable validation guide for `specs/006-fare-configuration-page`. Proves the feature end-to-end against the success criteria in `spec.md`. Contracts and data model live in `contracts/fare-configs-api.md`, `contracts/fare-config-page-ui.md`, and `data-model.md`.

## Prerequisites

- Node.js (LTS), pnpm 8.15.6 (repo-pinned), repository installed (`pnpm install` from root).
- Admin app running with `apps/admin/.env` → `VITE_API_URL` pointing at the Fastify backend.
- Backend (`apps/server`) running with the local Supabase stack (`supabase start`) and `apps/server/.env` present; an admin account for sign-in (the shell's login flow, `specs/005-admin-appshell`).
- Implementation phase: shadcn CLI components added (`pnpm dlx shadcn@latest add dialog alert-dialog switch table`), server guard + tests implemented.

## Setup

```bash
pnpm install
pnpm dlx shadcn@latest add dialog alert-dialog switch table   # in apps/admin
pnpm dev                 # turbo dev: admin + server
# scoped alternatives:
pnpm --filter admin dev
pnpm --filter server dev
```

Seed data: create at least one fare configuration via the UI (or the existing API/seed) plus one Route referencing it (via the Routes section or API) to exercise the delete guard.

## Quality gates (run before review)

```bash
pnpm lint                # root ESLint flat config
pnpm typecheck           # root typecheck, incl. apps/admin + apps/server
pnpm format:check        # repo prettier check
pnpm --filter admin test # vitest: fare-validation, fare-format (+ existing)
pnpm --filter server test  # requires local Supabase stack + apps/server/.env (guard tests)
```

All must pass green before the branch is reviewable. Server tests are written FIRST per the TDD convention.

## Validation scenarios (map to SC-001…SC-011)

| #   | Scenario             | Steps                                                             | Expected outcome                                                                                                          | SC                     |
| --- | -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | List                 | Open Fares with ≥2 configs (one default, one inactive)            | All rows show label, ₱ base fare, km, ₱/km, student/senior %, default badge, status badge; "Default" identifiable by text | SC-001, SC-008         |
| 2   | Create               | New fare configuration → valid values → Save                      | Row appears with exact values; success toast; survive reload                                                              | SC-002, SC-003, SC-007 |
| 3   | Create invalid       | Empty label; negative fare; discount 101                          | Inline errors; nothing persisted                                                                                          | SC-006                 |
| 4   | Duplicate label      | Create second config with an existing label (case-insensitive)    | Inline "label already exists" error; no save                                                                              | SC-011                 |
| 5   | Set as default       | Edit a non-default config → toggle Set as default → Save → reload | It is the single default; previous default badge gone; exactly one default                                                | SC-004                 |
| 6   | Default on inactive  | Edit the active default → toggle Active off                       | Inline "Reactivate before making default"; no state change; default stays active                                          | SC-010                 |
| 7   | Delete confirm       | Delete a non-default, unreferenced config                         | Confirm dialog; on confirm → inactive badge, success toast                                                                | SC-005                 |
| 8   | Delete sole default  | Try to delete the default config                                  | Delete action disabled/explained; no change                                                                               | SC-005                 |
| 9   | Delete referenced    | Try to delete a config referenced by an active Route              | Delete action disabled ("In use by N active route(s)"); (API race → CONFLICT toast, list unchanged)                       | SC-009                 |
| 10  | Server conflict race | Manually DELETE a referenced config via API/curl                  | `409 CONFLICT`; config stays active; page (after refetch) still shows it                                                  | SC-009                 |
| 11  | Save failure         | Stop server; save an edit                                         | Error toast; dialog stays open with values; list unchanged                                                                | SC-006 (FR-008)        |
| 12  | A11y/design          | Tab through page, dialogs, switches; automated contrast scan      | Keyboard-operable, visible focus, WCAG AA, text+color states, Route Sign grammar                                          | SC-008, FR-012/FR-013  |

Reviewers: run scenarios 1–12 with ≥ 5 people for the judgment-based checks (SC-008, FR-012/FR-013). Exact-value checks (SC-007) apply to every row (₱ two decimals when fractional, km, %).
