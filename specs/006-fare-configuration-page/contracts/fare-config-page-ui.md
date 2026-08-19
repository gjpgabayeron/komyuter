# Contract: Fares Page UI

User-interface contract for the Fares section (`apps/admin/src/pages/Fares.tsx` + `features/fares/*`). Visual rules: Route Sign grammar (pure white ground, signboard green-blue + signal amber for attention only, ≤4px corners, no shadows, no state by color alone — `DESIGN.md` / appshell tokens). All controls keyboard-operable with visible focus; WCAG AA contrast.

## Page structure (`/fares`)

1. **Page header** — title "Fares" (provided by the app shell `Header`), plus a **New fare configuration** button (primary).
2. **Content** — one of four states driven by `useFareConfigsQuery`:
   - **Loading**: skeleton rows (existing `skeleton` primitive).
   - **Error**: clear error message + **Retry** button (refetches the query); no partial data presented (FR-010).
   - **Empty** (no configurations): empty state ("No fare configurations yet") + call to create one.
   - **Loaded**: the fare configuration table.

## Table (`FareConfigTable.tsx`)

Semantic `<table>` (Base UI has no table primitive — shadcn `table` is styled HTML). Columns:

| Column           | Content                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Label            | label text; **Default** badge (text, color secondary) when `is_default`                     |
| Status           | **Active** / **Inactive** text badge (FR-012: text, not color alone)                        |
| Base fare        | `formatPeso(base_fare)`                                                                     |
| Base distance    | `formatKm(base_distance_km)`                                                                |
| Rate/km          | `formatPeso(rate_per_km)` + "/km"                                                           |
| Student / Senior | `formatPct` each                                                                            |
| Actions          | **Edit** (opens form dialog); **Delete** — disabled with explanatory label when `is_default |     | active_route_count > 0` ("In use by N active route(s)" / "Default — cannot deactivate the last default") |

Table header: `thead` with `scope="col"`; row actions are icon buttons with `aria-label`s. Deactivated rows are visually distinct (muted) but still fully readable (FR-012, US1 scenario 5).

## Create / Edit dialog (`FareConfigForm.tsx`)

Hosted in a shadcn `dialog` (Base UI — focus-trapped, ESC-dismissable). One component handles both modes; edit pre-fills current values.

Fields (with labels; inline error text under each invalid field):

| Field                | Control                          | Validation                                                                                                |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Label                | text input                       | required (trimmed); unique, case-insensitive, excluding self on edit (FR-004, Q3)                         |
| Base fare (₱)        | number input, `step=0.01`, min=0 | non-negative finite                                                                                       |
| Base distance (km)   | number input, `step=0.01`, min=0 | non-negative finite                                                                                       |
| Rate per km (₱)      | number input, `step=0.01`, min=0 | non-negative finite                                                                                       |
| Student discount (%) | number input, min=0 max=100      | 0–100 inclusive                                                                                           |
| Senior discount (%)  | number input, min=0 max=100      | 0–100 inclusive                                                                                           |
| Set as default       | `switch` + text label            | submit blocked when `is_default && !is_active` → inline error "Reactivate before making default" (FR-015) |
| Active (edit only)   | `switch` + text label            | toggling to inactive re-validates the default rule                                                        |

Create mode prefills the LTFRB defaults (₱13 / 4 km / ₱1.80 / 20% / 20%, spec Assumptions) and starts `is_active: true`.

Actions: **Cancel** (closes, discards) and **Save** (submit). On submit: validate → on success `invalidateQueries(["fare-configs"])` + success toast; on failure keep the dialog open with form values intact + error toast (FR-008). Double-submit prevented (submit disabled while pending — FR-014).

## Delete flow (`DeleteFareConfigDialog.tsx`)

- Trigger: the row **Delete** button (only enabled when `!is_default && active_route_count === 0`).
- Body: shadcn `alert-dialog` — "Delete fare configuration '<label>'?" + explanation "This deactivates the configuration; it can be reactivated later." + **Cancel** / **Delete**.
- On confirm: `DELETE` via the api module; success → invalidate + toast; server `CONFLICT`/`NOT_FOUND`/network → error toast, list unchanged, dialog closes (FR-008).

## Accessibility & behavior notes

- Text badges always carry the state word ("Default", "Active", "Inactive"); color is never the only signal (FR-012).
- Dialog fields have `<label>` associations; errors use `aria-describedby`.
- All mutations toast success/error (FR-008) via the existing sonner setup.
- No ETA / timing values anywhere (ADR-0009) — not applicable to fares, but no regression.

## Query keys (`lib/queryKeys.ts`)

```ts
export const fareConfigKeys = {
  all: ["fare-configs"] as const,
};
```

Mutations invalidate `fareConfigKeys.all`. (Factory pattern matches ADMIN.md §10.1; single key for now.)

## Admin unit tests (pure, in `apps/admin/src/tests/`)

- `fare-validation.test.ts`: required/duplicate label (incl. case-insensitivity + self-exclusion on edit); negative fares/km/rate rejected; discounts 0 and 100 accepted, −1 and 101 rejected; NaN rejected; `is_default && !is_active` rejected.
- `fare-format.test.ts`: `formatPeso` (13 → "₱13", 13.5 → "₱13.50"), `formatKm`, `formatPct` — exactness per SC-007.
