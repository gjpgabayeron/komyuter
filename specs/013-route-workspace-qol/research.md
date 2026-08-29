# Research: Route Workspace Quality of Life

**Phase 0 output** — every decision below was resolvable from the workspace audit (`apps/admin/src/features/routes` + `features/detours`, post-012 state) and the clarified spec; **no `NEEDS CLARIFICATION` remains** in the plan's Technical Context. Each entry: Decision / Rationale / Alternatives considered.

---

## R1 — Canonical field-label dialect and list

**Decision**: A single `LABELS` registry in `src/lib/labels.ts` holds one canonical string per field; "Color" (American) is canonical (resolves the "Colour"/"Color" drift); "Route code" and "Short name" keep their existing labels. Also holds `SAVE_COPY = { idle: "Save changes", saving: "Saving…", saved: "Saved just now" }` and section-heading tokens.

**Rationale**: The audit found "Colour" in `NewRouteDialog.tsx:123` and `properties/RouteGroup.tsx:92,125` while the rest of the UI and the design system (Tailwind/shadcn, DESIGN.md) use American spelling; two label styles exist (shadcn `Label` in dialogs vs `SectionLabel` in panels) with different sizes. FR-005/SC-004 require identical labels across surfaces — a registry makes that enforceable and unit-testable (no key maps to two strings).

**Alternatives considered**: Keep both spellings (rejected — violates FR-005/SC-004); canonicalize to British "Colour" (rejected — less consistent with the broader UI and library conventions); move labels into `@komyuter/shared` (rejected — client presentation concern, and spec forbids shared-package changes).

## R2 — Single source for every fixed semantic color

**Decision**: `src/lib/colors.ts` defines `SEMANTIC_COLORS` exactly once: activeRoute/signboard green-blue (`#1B6DB2`, today duplicated as `DRAFT_LINE` + raw hex), previewLine (`#FF5C00`, `map/constants.ts:9`), attentionAmber (today `#D97706` in `map/constants.ts:38` = Tailwind `amber-600` duplicated as class strings in `DetourGroup.tsx:335,451`, `StatusBar.tsx:72,81`, `NewRouteDialog.tsx:163`), nodeInk (`#0F172A`, raw in `RouteMap.tsx:339,344,504`), detourColors (`#C98A1B #178B7E #8E5CC3 #B4553C`), and the stop-shape colors (terminal green-blue, major_stop `#008554`, waiting_area amber `#C98A1B`). `map/constants.ts` re-exports the line tokens; `StopShape` keeps geometry/types but imports color values. Tailwind class usages are replaced by token-backed utilities (Tailwind v4 `@theme` variables in `index.css`) or inline `style` so a class string can never re-encode a hex.

**Rationale**: The audit counted 20+ raw copies of `#1B6DB2` (`RouteList.tsx:308,344`, `RouteMap.tsx:289,404,463`, `RouteOverviewLayer.tsx:137,142,281,293,333,460,541`, `plottingStore.ts:152`, `stopShapes.ts:20`, `routeColors.ts:4`, tests) and duplicated ambers (hex + Tailwind classes) that will drift into near-miss shades (FR-012/SC-007). One definition per semantic color is the only enforceable way to keep "the same semantic color renders identically everywhere".

**Alternatives considered**: Per-feature constants (rejected — that is the current drift); a design-token build step, e.g. Style Dictionary (rejected — no new tooling/deps, R7); sRGB-only reconciliation ignoring DESIGN.md OKLCH (rejected — DESIGN.md wins on visual values; exact OKLCH values are confirmed at implementation and recorded in DESIGN.md frontmatter per the design-system doc). Note: the two ambers today (`--route-amber: oklch(0.78 0.14 70)` corridor palette vs `#D97706` detour-draft amber) are reconciled into the single attention-amber token family; per-route corridor colors are presentation choices and remain data-like (out of scope, spec Assumptions).

## R3 — One save model across both editors

**Decision**: One `SaveButton` shared component + `SAVE_COPY` strings; the base editor's icon-only Save (`RouteWorkspace.tsx:203-218`, labeled "Save changes") and the Detour editor's text button (`DetourGroup.tsx:536`: "Save detour"/"Save changes") both adopt it — same label wording, same in-flight/success states, driven by `StatusBar`'s existing lifecycle ("Saved just now", 4 s). The detour save keeps its own gate + conflict recovery, but its conflict copy reuses the base `LoadLatestDialog` copy path (FR-003).

**Rationale**: FR-001/002/003 and SC-001/002/003 are about what the Administrator _sees_ — the underlying save mechanisms (`saveAll` vs detour gate) are deliberately different data flows and stay that way (spec: "reused, not redesigned"); only presentation unifies. The `PlotActionBar.tsx:320` docstring that describes a Save button it doesn't render is corrected in the same pass (FR-014/SC-007).

**Alternatives considered**: Merging the detour save into `saveAll` (rejected — couples two save targets/validations, out of scope, higher regression risk); moving the base Save into `PlotActionBar` (rejected — placement stays where it is; the contract is _label + presence parity_, not pixel-identical placement, since US1#1/#5 and FR-001 require the same rule, not the same coordinates).

## R4 — `mod+s` acts on the active editor

**Decision**: Bind `mod+s` to the Detour editor's own save gate while the Detour editor is active (same effect as its visible SaveButton); today it is **silently disabled** there (`RouteWorkspaceProvider.tsx:80-84` documents the deliberate disable). Base editor keeps its existing binding; focus mode = visible no-op; any open dialog keeps focus and intercepts (extend the existing Esc DOM-probe pattern, `RouteWorkspace.tsx:70-73`, to the other hotkeys).

**Rationale**: FR-004/SC-... require the shortcut to never be silently ignored while an editor is open — the audible/what's-the-point surprise the audit flagged. The detour gate already validates before saving, so binding the shortcut to it is safe (same entry point as the visible button).

**Alternatives considered**: Keeping the disable and surfacing a hint (rejected — violates FR-004 "never silently ignored"; a hint is a second unexplained behavior); having `mod+s` always call `saveAll` even in detour mode (rejected — would bypass the detour gate's validation).

## R5 — One panel-state treatment + explicit "Not set"

**Decision**: A shared `PanelState` component renders `loading | empty(action?) | error(onRetry) | loaded` with one visual treatment; `RouteList`, the stops sidebar, `DetourList`, `FocusPlate`, and the properties panels adopt it. Absent values render through `displayValue(value)` in `lib/format.ts` → "Not set", never a bare "—" that doubles as a loading placeholder; real zeros render as `0` (FR-009).

**Rationale**: FR-008/SC-005 require one pattern across all panels; the audit found `DetourList`'s explicit states, `RouteList`'s `Skeleton`, and `FocusPlate`/`RouteGroup` "—" fallbacks disagreeing. Unifying on one component makes `loading` vs `empty` vs `error` visually and behaviorally identical everywhere, and `displayValue` makes the zero-vs-absent distinction testable in `lib/format.ts` (existing formatter home — shared, never reimplemented).

**Alternatives considered**: Adopting one existing panel's states as the template without a shared component (rejected — copy-paste drift returns); per-panel "Not set" literals (rejected — same drift).

## R6 — Detour-stop reorder parity with base stops

**Decision**: `detourStore` gains reorder actions with the same semantics as the base list (`RouteList.tsx:374-418`: HTML5 drag-reorder, ArrowUp/ArrowDown): `moveDetourStop(index, direction)` + drag-completion handler; `DetourStopGroup`/`DetourSidebar` rows get the same drag handle and key handling, producing identical list-and-map results (FR-010/SC-006). History integration follows the existing detour history stack (`detourStore.ts` cap 50).

**Rationale**: The base stops already have this interaction; parity is the whole point of US4. The base store is not touched (no regression surface); the detour list reorders detour-only rows.

**Alternatives considered**: Extracting a shared reorder hook from `RouteList` (deferred to tasks if the extraction is trivial — the _behavior_ must be identical, the _hook_ is an implementation choice; R7 keeps deps zero); reusing base `moveStop` on detour rows (rejected — different stores, different row models).

## R7 — No new runtime dependencies

**Decision**: All standardization is plain TS modules, one small shared React component per pattern, Tailwind v4 `@theme` variables, and existing stores/hooks. Zero new runtime or dev dependencies.

**Rationale**: Spec constraints (client-only, no shared-package changes) plus the thesis constraint of a small, defensible surface; nothing here needs a library (no animation beyond existing `tw-animate-css`, no new a11y primitives beyond base-ui which is present).

**Alternatives considered**: A design-token pipeline (rejected, R2); a component library upgrade (rejected — base-ui/shadcn already installed); moving registries to `@komyuter/shared` (rejected — presentation data, client-only).

## R8 — Code hygiene tied to FR-014/SC-007

**Decision**: The audit's rough spots are folded into the affordance/confirmation work where they are user-visible (dead Merge-icon marker `RouteMap.tsx:504-508`, `PlotActionBar` docstring drift, spec-internal comments "Pasted #34/#42/#43/#44" in `RouteMap.tsx:117`/`NewRouteDialog.tsx:70`/`RouteList.tsx:474-477`, `RouteWorkspaceProvider`'s silently-disabled `mod+s` note, `DetourList.tsx:82-84` bare count spans vs badges elsewhere). `uiStore` (unused per audit) is removed unless a panel-state use emerges during tasks.

**Rationale**: FR-014 covers _visible_ affordances ("none looks clickable and does nothing"); the comment/docstring drift is the same trust problem at one remove (FR-014/US6#3: help/status text must match the controls that exist). Removing dead code keeps the touched surface reviewable.

**Alternatives considered**: A separate hygiene task list (rejected — these are one-line changes inside already-touched files; a separate feature would starve them); keeping `uiStore` "for later" (removed only if truly unused — decided at tasks, low risk).

---

## Open lane (clarification 2026-08-29)

No capability was named by the Administrator at plan time. If one is named during plan review, it is evaluated in `plan.md` → Complexity Tracking before any task is added; it does not enter `spec.md` (clarification Q1).
