---
timestamp: 2026-08-10T15-09-47Z
slug: apps-admin-src-pages-routeworkspace-tsx
---

# Critique snapshot — Admin Route Workspace (apps/admin/src/pages/RouteWorkspace.tsx)

Method: dual-agent (A: sa_20260810_144409_000000000_0e47ff4b2fb9 · B: sa_20260810_144409_000000000_13b5a82f512c)
Slug: apps-admin-src-pages-routeworkspace-tsx

## Design health: 30/40 (Nielsen heuristics, Assessment A)

| #   | Heuristic                   | Score | Key issue                                                                                                                     |
| --- | --------------------------- | :---: | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of system status |   3   | Save state is a silently appearing/disappearing button; no spinner, no persistent "saved" marker (RouteWorkspace.tsx:476-485) |
| 2   | Match system ↔ real world   |   3   | Great domain language but dev-speak leaks ("MAPBOX_SECRET_TOKEN", "out of sync")                                              |
| 3   | User control & freedom      |   4   | Undo/redo, nav guard, draft restore, confirmed deletes — strong escape paths                                                  |
| 4   | Consistency & standards     |   3   | Consistent shadcn, but window.confirm() beside styled AlertDialogs                                                            |
| 5   | Error prevention            |   3   | Exhaustive save validation; invalid hex silently ignored, empty stop names savable                                            |
| 6   | Recognition vs recall       |   3   | Great stop grammar; tool semantics and Layers rely on recall/tooltips                                                         |
| 7   | Flexibility & efficiency    |   3   | mod+s/mod+z/shift+z, arrow reorder; no duplicate route, no persisted layer prefs                                              |
| 8   | Aesthetic & minimalist      |   3   | Clean flat plates; up to 4 floating surfaces + banners at once; 10px chips                                                    |
| 9   | Diagnose & recover          |   3   | Conflict banner reassuring; save-block toasts terse jargon                                                                    |
| 10  | Help & documentation        |   2   | Tooltips + EmptyState only; zero onboarding for plot workflow                                                                 |

## Design specificity: mixed

Authored for "The Route Sign" in art direction (full-bleed map, plate overlays, no shadows, signboard green-blue tokens, stop markers as mini enamel plates with shape+color+label); category-interchangeable in interaction architecture (generic spatial-editor: left list + right inspector + bottom toolbar, stock shadcn interiors, "Properties" vocabulary). Map yields ~40% of frame to floating SaaS chrome at 1440px.

## Priority issues (A)

- P1 No responsive degradation — fixed-width absolute panels collide below ~964px (13" laptop ≈ 56px map corridor)
- P1 NavRail hover-expand (z-30, 16rem) swallows the route list in collapsed/hover modes (AppShell.tsx:46-48, NavRail.tsx:76)
- P2 Save feedback under-communicated — no dirty→saving→saved state machine
- P2 Banner slot collision — DraftRestoreBanner and conflict banner share top-3 left-1/2 z-20
- P2 POI search coupled by magic number (left-86 = 344px) and results list has no max-height
- P3 Dev jargon in admin copy; window.confirm() breaks design world; reduced-motion default not enforced

## Detector (B)

CLI scan clean: exit 0, zero findings incl. advisory on all targets (sanity-checked against a deliberately bad sample that produced 2 findings/exit 2). Browser visualization SKIPPED — no browser automation tool in this environment.

## Persona red flags

- Alex (power user): no duplicate route, layer prefs not persisted, Layers 3 menus deep, 550ms hover delay on insert-after, mod+s only macro
- Sam (a11y): no keyboard path on map, 10-11px text borderline AA, unnamed complementary region, route names only in mouse tooltip, no reduced-motion
- Iloilo admin curator: icon-only Select/Add with zero feedback on empty map, orange snap-lag preview reads as error, connection dropdowns list every stop, fare config buried in dropdown

## Provocative questions

1. If draft autosaves continuously, why is Save discrete? Instant durability + undo, conflict resolution the only explicit event?
2. Merge left list + right inspector into a single Route Sign plate (stops as a vertical sign board) — reclaim 40% of frame?
3. Whose job does the "3D" basemap do in a flat, printed-sign world?
4. Is two-mode overview→edit right, or one always-edit surface with a route switcher?
5. What with shell chrome gone while plotting — how close to literal "map is the interface"?
6. Is the 550ms hover delay the right affordance for insert-after?
