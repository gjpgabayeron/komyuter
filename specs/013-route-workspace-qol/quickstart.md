# Quickstart: Validating Route Workspace QoL

**Phase 1 output** — a runnable validation guide for SC-001…SC-010. Implementation details live in `tasks.md`; contracts in [contracts/](./contracts/); entities in [data-model.md](./data-model.md).

## Prerequisites

- pnpm workspace installed (`pnpm install` at repo root; `.npmrc` → `auto-install-peers`).
- Local Supabase stack **only needed for the untouched server suite**; the admin-side validation below needs just the admin app. Server tests must still pass unchanged (`pnpm --filter server test`) — no server code is touched.

## Static gates (run before any manual walkthrough)

```bash
pnpm typecheck                     # strict TS across packages
pnpm lint                          # root flat ESLint config
pnpm format:check                  # prettier check (semicolons, double quotes)
pnpm --filter admin test           # vitest: new registry/state/reorder tests + existing suites
pnpm --filter server test          # unchanged suite still green (needs supabase stack + apps/server/.env)
```

Expected: all green. The `colors.test.ts` **source-audit** test fails if any raw `#1B6DB2` / `#0F172A` / hardcoded `amber-600|700` class string exists outside `lib/colors.ts` and its sanctioned exports (guardrail for SC-007). The `labels.test.ts` test fails on duplicate or unresolved label values (guardrail for SC-004).

## Local run

```bash
pnpm dev                            # turbo — admin at http://localhost:5173 (check apps/admin README/port)
```

Sign in as an Administrator (Supabase Auth, admin role) → Routes → open a route with a Detour.

## Reviewer walkthrough (one pass ≈ 30 min, keyboard at hand)

| #   | Check (SC)                          | Steps                                                                                                                                                                                                                                                      | Pass when                                                                                                                  |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | One save model (SC-001/002/003)     | Edit a base-direction stop → **single** Save control shows `Save changes` → click → `Saving…` → dish plate `Saved just now` (≈4 s). Then edit a Detour: same control/label/wording. Force a conflict on each → same conflict notice + same recovery dialog | Labels identical between editors; never two save-looking controls; identical conflict copy + recovery                      |
| 2   | Vocabulary & labels (SC-004)        | Open New Route dialog + RouteGroup panel; compare "Color"/"Route code"/"Short name" labels and section headings across RouteList, Properties, DetourGroup                                                                                                  | Same canonical strings everywhere; no "Colour"; headings all `SectionLabel` style                                          |
| 3   | Panel states (SC-005)               | With data loaded vs. no detours vs. forced fetch error (network tab/offline): Stops sidebar, RouteList, DetourList, FocusPlate                                                                                                                             | Identical skeleton/empty/error treatment; empty Detour list shows "Add alternative route"                                  |
| 4   | Not-set vs zero (FR-009)            | Open a route with zero additional distance; open a stop with no commuter instruction                                                                                                                                                                       | Zero shows `0`; absent fields show `Not set` (never "—")                                                                   |
| 5   | Detour-stop parity (SC-006)         | In Detour editor select a detour stop → ArrowUp/ArrowDown reorder it; drag the drag-handle to move it; watch list + map toast/status update; undo/redo                                                                                                     | Identical list+map result and keyboard affordances as base stops; history correct                                          |
| 6   | `mod+s` (FR-004)                    | In Detour editor press `mod+s` (pristine): nothing silently swallowed — save fires via the same gate as the visible button                                                                                                                                 | Save works; a dirty detour saves on the first press                                                                        |
| 7   | Colors (SC-007)                     | Diff a screenshot: loop badge, draft line, terminal stops, split/merge nodes, detour draft line vs. summary glows                                                                                                                                          | Every semantic color matches the registry exactly (no near-miss shades); keys of the static-gate pass support this         |
| 8   | No dead/confusing controls (SC-009) | Inventory every control in EmptyState (Import), PlotActionBar, map markers, StatusBar                                                                                                                                                                      | "Import" is visibly disabled with "Coming soon" reason; no control looks active-but-inert; tooltips describe real controls |
| 9   | Confirmation pattern (SC-008)       | Trigger stop delete, route delete, detour delete, leave-with-unsaved, save conflict                                                                                                                                                                        | All five use one dialog structure/treatment; Esc + focus trap identical                                                    |
| 10  | Keyboard-only (SC-010)              | Do all of the above with keyboard only (`tab`/`enter`/`esc`/`mod+s`/arrows)                                                                                                                                                                                | Every touched surface operable; no keyboard trap; no silent shortcut swallowing with an editor open                        |

## Exit criteria

Static gates green **and** all 10 walkthrough rows pass → feature meets the spec's success criteria. Any coordinate-order regression at any point is release-blocking (ADR-0013 [lng, lat]) — spot-check a plotted stop's lon/lat pair in the polyline JSON while walking rows 5 and 7.
