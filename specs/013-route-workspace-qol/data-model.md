# Data Model: Route Workspace Quality of Life

**Phase 1 output** — this feature is **client-only**; the server schema, `@komyuter/shared` types, and data semantics are **unchanged** (spec Assumptions, FR-019). This document models the new client-side **standardization artifacts** the spec names as arbiters (Key Entities), plus the unchanged domain entities they reference.

## Unchanged domain entities (referenced, not modified)

| Entity      | Meaning                                                        | Unchanged invariants                                                                                  |
| ----------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Route       | A service line; has `routeId`, name/short name, default color  | Identity and uniqueness per `@komyuter/shared`; new-route defaults from `routeColors.ts`              |
| Direction   | One direction of a Route with its own polyline + ordered stops | Per-direction polyline + stop list (ADR-0008); `[lng, lat]` everywhere (ADR-0013)                     |
| Stop        | Boarding point on a Direction (`terminal                       | major_stop                                                                                            | waiting_area`) | Shape+color pair identity (never color alone, FR-013); hail-and-ride = request-time virtual nodes (unchanged) |
| Detour      | Alternative-route deviation with entry/exit/loop               | Anchored ≤ 30 m from base polyline; soft-delete; per-detour color from `detourColorFor` (hash-stable) |
| Detour Stop | Stop on a Detour                                               | Reorderable row within the detour order (FR-010 — the only behavioral addition)                       |

No field, type, relationship, or validation changes to any of the above.

## New client-side artifacts (the standardization arbiters)

### 1. `LabelRegistry` — canonical label reference (FR-005/SC-004)

| Field      | Type                               | Rules                                                                                                                |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `key`      | `LabelKey` (string union, typed)   | Unique; one key per semantic field                                                                                   |
| `value`    | string                             | Canonical label; **no two keys map to the same string** (uniqueness guard), no variants ("Color" only, not "Colour") |
| `fieldFor` | string (validation text, optional) | e.g. "Route code", "Short name" — same canonical rule applies to helper copy                                         |

Artifact: `apps/admin/src/lib/labels.ts` → `LABELS` + `label(key)` helper + `SAVE_COPY` section (save strings below).

**Validation rules**: every surface reads labels only via `label(key)`; tests assert key-set completeness (every key the UI uses resolves) and value uniqueness. Section headings use `SectionLabel`; field labels use one `Label` style — no second size variant (FR-006).

### 2. `SemanticColorRegistry` — semantic color set (FR-012/SC-007)

| Key              | Role (Design System)                                                                          | Value (source of truth)                                                            | Today's drift (audit evidence, to migrate)                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `activeRoute`    | Signboard green-blue — active/draft line, loop badge, terminal, labels, `DEFAULT_ROUTE_COLOR` | `#1B6DB2` (OKLCH confirmed at implementation, recorded in DESIGN.md)               | Raw `#1B6DB2` ×20+ (`RouteList`, `RouteMap`, `RouteOverviewLayer`, `plottingStore`, `stopShapes`, `routeColors`, tests)      |
| `previewLine`    | Vivid orange — transient snap-preview line                                                    | `#FF5C00`                                                                          | `map/constants.ts:9` only (already single-sourced — re-home)                                                                 |
| `attentionAmber` | Signal amber — live detour composition, hail attention, warnings                              | `#D97706` (reconciled from `--route-amber` oklch family per DESIGN.md)             | `map/constants.ts:38` + Tailwind `amber-600`/`amber-50/500/700` class strings (`DetourGroup`, `StatusBar`, `NewRouteDialog`) |
| `nodeInk`        | Workspace ink — split/merge/snap nodes                                                        | `#0F172A`                                                                          | Raw in `RouteMap.tsx:339,344,504`                                                                                            |
| `detourColors`   | Per-detour line cycle (4 values)                                                              | `#C98A1B #178B7E #8E5CC3 #B4553C`                                                  | `map/constants.ts:14-19` (re-home; keep `detourColorFor` hashing)                                                            |
| `stopColors`     | Per-stop-type colors (3 values)                                                               | terminal `#1B6DB2` (= `activeRoute`), major_stop `#008554`, waiting_area `#C98A1B` | `stopShapes.ts:20-24` (values imported from registry)                                                                        |

**Validation rules**: exactly one definition per key; a **source-audit test** scans `apps/admin/src` and fails on any raw `#1B6DB2` / `#0F172A` / `amber-600|700` string outside the registry and its sanctioned exports (guards SC-007 against re-drift). Tailwind arbitrary-class hex is replaced by `@theme`-backed utilities or inline `style` from the registry (R2). Route corridor palette (`--route-*` CSS vars) is presentation/data, out of registry scope.

### 3. Save-copy & save-control contract

`SAVE_COPY = { idle: "Save changes", saving: "Saving…", saved: "Saved just now" }` (4 s life, `StatusBar` plate + `SaveButton`). Shared by base editor and Detour editor (FR-001/002). Conflict copy: one shared notice + `LoadLatestDialog` recovery text (FR-003).

### 4. `PanelState` — one list/panel state pattern (FR-008/SC-005)

| State     | Contents                                                             | Behavior                            |
| --------- | -------------------------------------------------------------------- | ----------------------------------- |
| `loading` | Standard skeleton treatment                                          | No interaction                      |
| `empty`   | Standard empty copy + optional action (e.g. "Add alternative route") | Action present only when meaningful |
| `error`   | Same wording + retry                                                 | `onRetry` re-fetches                |
| `loaded`  | Content                                                              | Normal                              |

`displayValue(value)` (`lib/format.ts`): `null`/`undefined` → "Not set"; `0` → `"0"` (never "Not set"); strings/numbers pass through (FR-009).

### 5. Confirmation pattern (FR-015/SC-008)

One `ConfirmDialog` shell: `title`, `message`, `confirmLabel`, `destructive?`, callbacks `onConfirm`/`onCancel`; adopted by stop-delete, detour-delete, route-delete, leave-with-unsaved, and save-conflict recovery. Identical structure across all five (FR-015).

## Relationships

- Every touched **surface** (RouteList, RouteMap, properties, DetourGroup, dialogs…) → **consumes** the registries (`labels.ts`, `colors.ts`) and the shared components (`SaveButton`, `PanelState`, `ConfirmDialog`); none defines its own copy.
- `detourStore` (existing) + **reorder actions** (`moveDetourStop`, drag completion) — new transitions only on the Detour Stop order; history via the existing detour history stack (cap 50).
- No new persistence: drafts/history/conflicts remain exactly as today.
