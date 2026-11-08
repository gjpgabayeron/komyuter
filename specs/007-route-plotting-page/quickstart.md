# Quickstart — Route Plotting Page Validation Guide

Phase 1 output. Runnable scenarios that prove the feature works end-to-end, mapped to the spec's Success Criteria (SC-001…SC-015). Implementation details live in [tasks.md](./tasks.md) (Phase 2); API shapes in [contracts/](./contracts/); entities in [data-model.md](./data-model.md).

## Prerequisites

- pnpm workspace install: `pnpm install` (root `.npmrc` sets `auto-install-peers = true`)
- Local Supabase stack up (Postgres/PostGIS + Auth), per `specs/001-local-supabase-backend/`; `apps/server/.env` present (auto-loaded by `apps/server/src/config/env.ts`)
- Optional: `MAPBOX_SECRET_TOKEN` in `apps/server/.env` — **not required**; without it the snapping proxy serves the mock straight-line fallback (`snapped: false`, FR-009)
- Optional: `MAPBOX_PUBLIC_TOKEN` in `apps/admin/.env` — without it the map uses OSM raster tiles

## Setup

```bash
pnpm dev            # turbo — starts admin (Vite) + server (Fastify) (+ web if present)
```

Login to the admin dashboard (Supabase Auth, `RequireAuth`).

## Scenario 1 — Empty state, create route, plot, save atomically (SC-001, SC-002, SC-003, SC-005, SC-011, SC-012, SC-013, SC-014)

1. Open **Routes → Plot** (`/routes` → workspace with no route selected).
   - **Expect**: map fills the viewport; a guidance overlay ("Create new route" + "Import JSON dataset (coming soon)") — the import button is disabled with the coming-soon label (FR-030, SC-011).
2. **Create new route** → dialog → name, short name, color → save.
   - **Expect**: route appears in the floating nav overlay; workspace loads (empty, no directions).
3. Enter plot mode, **Automatic** (default). Place stops along a real road (Iloilo City Proper area).
   - **Expect**: each placed stop gets an auto-default name "Stop N" in order (FR-028); a road-snapped preview appears ≤ ~500 ms after the last placement (FR-008; straight-line + warning if no token — FR-009, SC-006 shapes/square-circle-diamond for the three types).
4. **Apply** the preview → **Revert** → **Apply** again.
   - **Expect**: applying replaces the connecting line with the snapped path; revert restores the previous line; both actions undoable (FR-013).
5. Drag a stop to a new spot.
   - **Expect**: the path re-snaps through the new position; undo restores the previous position; state is part of the draft (FR-029, SC-004).
6. Select a stop → right-side properties panel.
   - **Expect**: panel appears with name/type/guarantee fields; editing type changes the map shape; changing name persists with next Save (FR-018, FR-019, SC-008, SC-009).
7. Press `mod+s` (Save).
   - **Expect**: one request to `POST /api/admin/routes/:routeId/directions`; success renders **both** the base direction and the auto-derived return direction (reversed polyline, reversed stops, swapped origin/destination — FR-012/ADR-0011); draft cleared (SC-013 atomic: either both directions + all stops present or nothing).
8. Reload the page → open the route.
   - **Expect**: both directions with their stops and paths render (SC-005); no draft banner (draft was cleared).

## Scenario 2 — Save-blocking validation (FR-004, FR-017, SC-014, SC-015)

1. Place **only one** stop, or end the path somewhere that is not a stop, then Save.
   - **Expect**: save blocked with an explanation; nothing was sent (SC-014); the draft and undo history remain intact.
2. Close/reload mid-plot (unsaved changes) → revisit within 24h.
   - **Expect**: confirm-guard on navigation; a "Restore draft / Discard" banner on return; Restore continues the exact state incl. undo history; Discard clears the draft key (FR-014).
3. Simulate > 25 waypoints (or check the proxy logs on a long route) — Expect chunked snap requests concatenated into one continuous polyline.

## Scenario 3 — Editing an existing plotted route

1. Load a route that already has directions → enter plot mode.
   - **Expect**: existing stops + polyline rendered; the draft starts empty and is scoped to the current direction (FR-003).
2. Re-save with changes — Expect the atomic endpoint replaces the direction's stops with the new ordered set.

## Quality gates (run before commit)

```bash
pnpm lint                                  # single root ESLint flat config
pnpm typecheck                             # tsc --noEmit across packages
pnpm format:check                          # prettier check (semicolons, double quotes)
pnpm --filter admin test                   # vitest — pure plotting helpers (coords, history, draft, selection, shapes)
pnpm --filter server test                  # vitest — unit (derive, mapbox proxy w/ stubbed fetch) + integration (atomic save; needs Supabase stack)
```

Expected: all green. Server tests are written first (TDD per `specs/001-local-supabase-backend/tasks.md`).

## Cross-checks against success criteria

| SC         | Quickstart proof                                                   |
| ---------- | ------------------------------------------------------------------ |
| SC-001/002 | Scenario 1 step 1–2                                                |
| SC-003     | Scenario 1 step 3                                                  |
| SC-004     | Scenario 1 step 5 (drag + undo)                                    |
| SC-005     | Scenario 1 step 8                                                  |
| SC-006     | Scenario 1 step 3 (type shapes)                                    |
| SC-007     | Layer toggles hide/show stops/terminals/routes on the map          |
| SC-008/009 | Scenario 1 step 6                                                  |
| SC-010     | No ETA/duration anywhere in UI; proxy strips `duration` (contract) |
| SC-011     | Empty-state overlay + disabled import button                       |
| SC-012     | Plot-and-save cycle under 5 min on first attempt (manual timing)   |
| SC-013     | Scenario 1 step 7 (transactional, all-or-nothing)                  |
| SC-014/015 | Scenario 2 step 1 (validation)                                     |

## References

- Contracts: [admin-save-api.md](./contracts/admin-save-api.md), [mapbox-directions-proxy.md](./contracts/mapbox-directions-proxy.md)
- Data model & transitions: [data-model.md](./data-model.md)
- Design research: [research.md](./research.md)
