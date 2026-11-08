# Data Model: Alternative Route (Detour) Plotting — Phase 1

Scope note: this feature adds **no new server tables and no shared-schema changes**. The persisted entities below (`Detour`, `NotableStop`) already exist; this document records their contract as the feature consumes it, plus the two client-only state entities the editor introduces (`DetourDraft`, `DetourPlanningState`). Source of truth for every server field: `apps/server/src/db/schema.ts:170-192`, `packages/shared/src/schemas/domain.ts:105-118`, `packages/shared/src/types/domain.ts:63-83`.

Coordinate order is `[longitude, latitude]` everywhere (ADR-0013).

---

## Detour (server — exists, unchanged)

**Purpose**: A rider-visible alternative to the base path of one travel Direction: a loop anchored at `entry`/`exit` on the Direction's base polyline, replacing the base segment between those two points (ADR-0008 model).

| Field                        | Type            | Constraints (zod / DB)                                                                                     | Source                                  |
| ---------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `detour_id`                  | `text` PK       | generated `detour_` uuid (server)                                                                          | DB                                      |
| `direction_id`               | `text` FK       | notNull → `directions.direction_id` onDelete cascade                                                       | DB                                      |
| `label`                      | `text`          | notNull, ≥1 char (`z.string().min(1)`)                                                                     | writer                                  |
| `entry`                      | `GeoPoint`      | Point GeoJSON `[lng,lat]`; must lie on base polyline ≤30 m (`assertPointOnLine`)                           | editor (snapped)                        |
| `exit`                       | `GeoPoint`      | Point GeoJSON `[lng,lat]`; must lie on base polyline ≤30 m                                                 | editor (snapped)                        |
| `detour_polyline`            | `GeoLineString` | LineString GeoJSON; `loop[0] ≈ entry` and `loop[last] ≈ exit` ≤30 m (**new FR-023 check**); `entry ≠ exit` | editor (road-followed loop)             |
| `additional_distance_meters` | `integer`       | `z.number().int().min(0).nullable().optional()`, DB nullable                                               | client-computed (FR-011, exact)         |
| `commuter_instruction`       | `text`          | notNull, ≥1 char                                                                                           | writer (required, US3)                  |
| `driver_instruction`         | `text`          | nullable, `.nullable().optional()`                                                                         | writer (optional, US3)                  |
| `notable_stops`              | `jsonb`         | array of `NotableStop` (below)                                                                             | editor picker (Q1: existing Stops only) |
| `is_active`                  | `boolean`       | notNull, default `true`; NOT on create schema — sent only via update                                       | list toggle                             |
| `created_at` / `updated_at`  | timestamps      | server                                                                                                     | DB                                      |

**Validation rules** (where enforced):

| Rule                                               | Tolerance / Value                                                    | Enforced by                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| entry/exit on base polyline                        | ≤ 30 m (`DETOUR_ON_LINE_TOLERANCE_METERS`, `validation.ts:8`)        | server `assertPointOnLine` (POST `detours.ts:54-55`; PUT `:113-118`) — **exists**                            |
| loop start ≈ entry, loop end ≈ exit                | ≤ 30 m (same constant)                                               | **NEW** `assertDetourLoopEndpoints` (FR-023, SC-014) — server POST always, PUT when loop/entry/exit supplied |
| degenerate loop                                    | `entry ≠ exit` (>30 m apart)                                         | **NEW** same validator                                                                                       |
| `additional_distance_meters ≥ 0`                   | zod `min(0)`                                                         | type-provider → 422 — **exists**                                                                             |
| travel order (entry index < exit index along base) | —                                                                    | **client only** (detourStore, save refusal + swap dialog FR-004)                                             |
| label / instructions non-empty                     | `min(1)`                                                             | zod — **exists**                                                                                             |
| notable stop `stop_id` non-empty                   | `z.string().min(1)`; **no FK** (Q1 decision: editor guards sourcing) | zod — **exists**                                                                                             |

**State transitions**:

```text
[editor draft] ──POST (201)──▶ Detour{is_active:true} ──PUT{is_active:false}──▶ soft-deleted (row kept, hidden from commuter)
        ▲                                  │
        └─────────── PUT{fields} ◀─────────┘  (edit re-opens editor prefilled; DELETE = same soft-delete)
```

- POST → `201 { success, data: Detour }`; PUT/DELETE → `200 { success, data }`; both 404 notFound when target missing; 422 `VALIDATION_ERROR` for any zod or FR-023 failure (envelope in `apps/server/src/api/app.ts`, errors in `api/errors.ts`).

---

## NotableStop (value object — exists, unchanged)

**Purpose**: A stop worth calling out along a detour (vs. the direction's own stops). Stored inline in `detours.notable_stops` JSONB; **references an existing Stop** (`stop_id`) — no FK in the shared schema (`schemas/domain.ts:22-26`), the editor is the guard (Q1).

| Field            | Type      | Constraints                                                                                       |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `stop_id`        | `string`  | ≥1 char; MUST reference an existing Stop's `stop_id` (sourced from the owning route's directions) |
| `name`           | `string`  | ≥1 char; display name (from the Stop)                                                             |
| `is_detour_only` | `boolean` | toggle in picker: stop is notable only in the detour context                                      |

**Relationships**: 1 Detour → 0..n NotableStop. N/A state transitions (immutable value object; editor replaces the array in the draft/save payload).

---

## DetourDraft (client localStorage — NEW)

**Purpose**: 24-hour crash/close safety for in-progress detour edits, mirroring the base-path draft design (`features/routes/draft.ts`); never sent to the server.

**Key**: `komyuter.draft.{routeId}.{directionId}.detours` — deliberately namespaced apart from the base-path draft key (research R7 — no collision).

| Field                     | Type                                                  | Notes                                          |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `savedAt`                 | `ISO` string                                          | 24h TTL on restore (same policy as base draft) |
| `routeId` / `directionId` | `string`                                              | owner identity for restore-offer matching      |
| `mode`                    | `{ kind: "new" } \| { kind: "edit", detour_id }`      | which surface the draft belongs to             |
| `entry` / `exit`          | `{ coordinate, index }`                               | snapped point + base-polyline index            |
| `waypoints`               | `CoordinatePair[]`                                    | intermediate loop waypoints                    |
| `loop`                    | `GeoLineString \| null`                               | last road-followed result                      |
| `fields`                  | `{ label, commuter_instruction, driver_instruction }` | form state                                     |
| `notableStops`            | `NotableStop[]`                                       | picker selection                               |
| `history`                 | `HistoryEntry[]`                                      | serialized undo/redo stack                     |

**State transitions**: dirty write on every store change (debounced) → restore-offer banner on re-enter (Accept → reseed store; Dismiss → clear) → cleared on successful save or explicit discard.

---

## DetourPlanningState (client store — NEW, transient)

**Purpose**: The zustand slice driving the editor surface (`features/detours/detourStore.ts`), mirroring `plottingStore`'s architecture (bindSnapFetcher → snapPreview debounce, history stack, hotkeys).

| Slice                     | Contents                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                    | `"closed" \| "new" \| edit: { detour_id }`                                                                                                               |
| `entry` / `exit`          | snapped `{ coordinate, index }` or null; placement via `projectPointOnPolyline` (NEW `coords.ts` helper)                                                 |
| `waypoints`               | `CoordinatePair[]`; the loop request is `snapPreview([entry, ...waypoints, exit])`                                                                       |
| `loop`                    | `GeoLineString \| null` (last snap result; may be straight-line fallback + warning flag, FR-009)                                                         |
| `fields` / `notableStops` | editable state (auto label derived from entry/exit)                                                                                                      |
| `derived`                 | `additionalDistanceMeters = polylineDistanceMeters(loop) − polylineSegmentLength(base, entry.index, exit.index)` (NEW helper; read-only display, FR-011) |
| `history`                 | undo/redo entries: `entry-placed`, `exit-placed`, `waypoint-add/remove`, `loop-drawn`, `field-edited`, `notable-stop-toggle`, `mode-change`              |
| `validity`                | client pre-save gate: entry<exit order (FR-004), loop endpoints ≈ entry/exit, loop length > 0                                                            |

**State transitions** (editor lifecycle):

```text
closed ──(Add alternative route / edit existing)──▶ new | edit ──▶ drafting ──▶ save
                                                      ▲                    │
                                                      └───── reopen (draft) ─┘
```

- Draft-boot: on open, if a valid ≤24h `DetourDraft` exists for the direction → offer restore (US1).
- Save success → clear draft, mode → closed, server list invalidated.
- Client gate failure → styled confirm (travel-order swap, degenerate-loop refusal) — no request sent (FR-004, FR-018).
- Server 422 → toast with reason, editor stays open (SC-014 visible behavior).

---

## Relationships (with existing entities)

```text
Route 1──n Direction 1──n Detour (detours.direction_id, cascade)
Direction 1──n Stop (existing; base-path editor's stops)
Detour ──0..n NotableStop ──references──> Stop (existing, Q1 — no FK, editor-sourced)
Detour ──uses──> Direction.base_polyline (anchor for entry/exit snap + segment slice)
```
