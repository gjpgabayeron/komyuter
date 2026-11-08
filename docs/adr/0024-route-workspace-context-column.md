# ADR-0024: The route workspace reveals a second left column for search (supersedes ADR-0015 §2's track list)

**Status**: DECIDED (2026-10-29) · Supersedes **the track list in §2 of [ADR-0015](./0015-workspace-floating-plates-over-map.md)**
(`256 | 0 | transparent center | 0 | 336`). Everything else survives unchanged: §1 (one persistent map, full-bleed
backdrop, GL canvas never resizes), §2's content-adaptive plate rule and 12 px inset, §3–§6 (transparent center
track, chrome placement, empty state, `MapProvider` at the root), the four-state model, desktop-only, the geometry
tokens, the 400 px floor and `NarrowWindowGate`.

## Context

The search surface outgrew the right column. It now has to carry candidate rows, an insertion anchor, distances and
five answer states, and while it holds that column it displaces Properties and pinches the map on both sides: 896 px
of unoccluded map at a 1488 workspace, 384 px at the documented 1024 window where the gate already fires.

The owner's frame ("Route Page Search State Layout") proposes the Google Maps shape: search results as a panel
beside the map, on the left. Two left columns is also the only arrangement that keeps the **insertion anchor** — the
selected stop a searched place will be inserted after — visible while the admin is choosing, because a POI is added
after the current selection, not at a free position.

## Decision

1. **A context column beside the stops list, revealed for a session**: 320 px, with the same 12 px inset as
   every other column, mounting over the free region's left edge. It is an **overlay panel, not a fourth grid
   track** — refined 2026-10-29 while implementing #24: a real track reflows the transparent centre, which
   would shift the floating chrome (the search pill) sideways the instant results appear, moving the input
   under the caret. The grid therefore keeps its five tracks (`256 | 0 | centre | 0 | 336`) and the context
   plate paints above the map and below the stops column. The map stays `absolute inset-0` behind everything,
   exactly as ADR-0015 §1 describes.
2. **The reveal is an overlay transform, never a track resize.** The context plate slides over the map's left edge;
   the GL canvas keeps its size, its camera and its pixel centre. This is what keeps §1's claim ("the GL canvas never
   resizes at all") and SC-002's smoke check true — see the rejected push reveal below.
3. **Search is a layout variant, not a fifth state.** `uiState` keeps deriving from (selection, draft); a
   `WorkspaceLayout` variant (`edit` | `edit+search`) names the plate configuration. The frame's phrase "search state
   layout" maps to that variant and never to `uiState`.
4. **Properties yields for the session.** The right plate hides while a search session runs and returns on close;
   results and Properties never coexist. Unoccluded map: 912 px at 1488 during search (896 today, so search gains and
   nothing loses), edit unchanged at 896.
5. **The context surface is a plate, not a docked slab.** Content-adaptive height capped at 66 % of the workspace,
   header pinned, rows scrolling independently of the stops list. It obeys the Route Sign grammar (≤4 px corners, no
   shadows) — the frame's 8 px radius and the drop shadow on _Search this area_ are deliberately not adopted.
6. **The reveal triggers on the query (≥ 3 characters), not on focus.** The pill stays in the chrome row (ADR-0015 §4),
   never animates while focused, and `mod+k` focuses it. `Esc` reverses the reveal on the same 180 ms ease-out curve,
   instant under `prefers-reduced-motion`.
7. **One visible-region measure.** `computeMapWidth`'s existing semantic — the free map region between the plates — now
   counts the context plate and **is consumed at runtime**: every camera fit (`RouteFitter`, `PoiFocuser`,
   `fitToOverview`) and `poiScope`'s in-view test read it instead of carrying their own paddings. The reveal's
   compensating pan is a single `easeTo({ padding, duration: 180 })` on the plate's own easing, not a second motion.
8. **The plate's content contract** lives in the frame spec, not here: two-line header (count + insertion anchor),
   anchor-relative distance, five states including the _absent_ state on a confident single hit, and no numbering on
   candidate pins — stops already own `1..N` as route order, and a numbered candidate beside a numbered stop plate is
   the worst ambiguity this viewport can produce.

## Considered options

- **Push reveal** (the map reflows to make room). Truest to Google Maps, rejected: it resizes the canvas on every
  open and close, breaks §1's claim and SC-002's verification, and forces every fit to re-run mid-animation or leave
  the route under the plate.
- **Sliding swap** (results replace the stops column, one column total). Cheaper and calm, rejected: it hides the
  insertion anchor at the exact moment the anchor decides where the place goes.
- **Three plates during search** (keep Properties on the right). Rejected: 576 px of unoccluded map at 1488 and the
  gate firing below ~1408 px — the pinch this change exists to remove.
- **A fifth workspace state** (`search` alongside empty/overview/focus/edit). Rejected: it would make the derived
  state machine depend on an ephemeral focus/query flag, and would supersede ADR-0015's four-state model as well,
  forcing specs/008, `docs/ADMIN.md` and the UI-state tests to be rewritten for no gain.

## Consequences

- The gate arithmetic keeps its shape: at the 1024 window (976 workspace) the search state lands on `976 − 576 = 400`,
  exactly the floor, so the gate stays closed there; edit stays at 384 and still gates, as today.
- `plateSlotsFor` (workspace) is the two-slot rule — context slot (results ⇄ hidden), right slot (properties ⇄
  hidden) — replacing the old single-slot `rightPlateFor`.
- Fits stop carrying local padding, so "fit the route" can no longer frame a route underneath a plate.
- The insert-after rule becomes visible UI (the anchor line) rather than a rule hidden inside `addPoiAsStop`.
- Still open, not decided here: the plate radius conflict between DESIGN.md (≤4 px) and
  `components/shared/Plate.tsx` (`rounded-lg`, 8 px). That decision is repo-wide, not search-specific.

## Where recorded

`apps/admin/.impeccable/surfaces/apps-admin-route-page.md` — the frame spec: geometry table, reveal timings, plate
content, five states, camera/measure rules, open items. `docs/ADMIN.md` follows at implementation time.
