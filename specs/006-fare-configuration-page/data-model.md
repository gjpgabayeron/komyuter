# Data Model: Fare Configuration Page

Model for `specs/006-fare-configuration-page`. The persisted entity is server-owned; the page adds a derived field and client-side form/query state. Contracts are documented in `contracts/fare-configs-api.md` and `contracts/fare-config-page-ui.md`.

## Entities

### FareConfiguration

The fare type a Route references. Persisted in the existing `fare_configs` table; the page consumes it via the admin API.

| Field                       | Type    | Constraints / notes                                                                        |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `fare_config_id`            | string  | Server-generated slug (`fare-<label>`, disambiguated). Immutable on edit.                  |
| `label`                     | string  | Required. **Unique** among fare configurations (client-rejected inline, case-insensitive). |
| `base_fare`                 | number  | ₱, non-negative. Displayed exactly (2 decimals when fractional).                           |
| `base_distance_km`          | number  | km, non-negative.                                                                          |
| `rate_per_km`               | number  | ₱/km, non-negative.                                                                        |
| `student_discount_pct`      | number  | Percent, `[0, 100]` inclusive.                                                             |
| `senior_discount_pct`       | number  | Percent, `[0, 100]` inclusive.                                                             |
| `is_default`                | boolean | Exactly one default server-enforced. **Default is always active** (FR-015).                |
| `is_active`                 | boolean | Soft-delete flag; deactivate = delete.                                                     |
| `active_route_count`        | number  | **Derived (new)**: count of Routes with `fare_config_id = this AND is_active = true`.      |
| `created_at` / `updated_at` | string  | ISO timestamps (server).                                                                   |

Validation (client `validateFareConfigForm` + server zod schemas from `@komyuter/shared`): label required/unique; `base_fare`, `base_distance_km`, `rate_per_km` non-negative finite numbers; discounts `0–100`; `is_default: true` requires `is_active: true` (client blocks submit; FR-015).

### Route (read-only dependency)

Not edited by this feature; only its reference relation matters.

- `route_id`: string, `fare_config_id: string | null` (FK → `fare_configs`), `is_active: boolean`.
- Used by the delete guard: deactivation of a FareConfiguration is rejected when `fare_config_id = :id AND is_active = true` exists.

## Relationships

- **Route `*──1` FareConfiguration** — many Routes reference one fare configuration (via `fare_config_id`). This reference blocks deactivation while the Route is active.
- FareConfiguration has no children; the page never modifies Routes.

## Lifecycle / state transitions

```text
                    ┌──────────────────────────────────────────────┐
                    │  create (POST) → is_active=true,             │
                    │   is_default=false (unless set-as-default)   │
                    └──────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌─────────────►  active, not default
        │                      │                │
        │  set-as-default      │                │  set default elsewhere
        │  (server un-sets     ▼                │  (exactly-one rule)
        │   previous default)  ┌──────────────────────────┐
        └──────────────────────│   active, is_default     │
                               │   (default always active)│
                               └──────────────────────────┘
                                  │           │
        reactivate (edit)         │           │  edit → is_active=false
        ┌─────────────────────────┘           ▼
        │                     inactive (soft-deleted); may be reactivated
        │                     DEACTIVATION BLOCKED when:
        │                       • it is the sole default (server), or
        │                       • active_route_count > 0 (server CONFLICT + client-disabled)
        └──────────────────── (no hard delete anywhere)
```

Guard invariants:

1. **Exactly one default** — server-enforced on create/update (setting `is_default: true` clears the previous default in the same transaction path).
2. **Default is always active** — client rejects marking an inactive configuration default (FR-015) and the server rejects any update that would leave an inactive default (CONFLICT); the edit dialog edits both flags together.
3. **No deactivation while referenced** — `DELETE` is refused when any active Route references the configuration (server CONFLICT) and the page disables the action when `active_route_count > 0` (FR-007).
4. **No deactivation of the sole default** — existing server behavior, kept and regression-tested.
5. **Labels unique** — client-enforced against the loaded list (case-insensitive), self-excluded on edit.

## Client-side state

- **List query cache**: `["fare-configs"]` (react-query, `staleTime` 30 s per `lib/queryClient.ts`); invalidated after every successful create/update/deactivate so the list always reflects server state (FR-009).
- **Form state** (dialog, local): `label`, `base_fare`, `base_distance_km`, `rate_per_km`, `student_discount_pct`, `senior_discount_pct`, `is_default`, `is_active` (edit only; create starts active). Prefilled with LTFRB defaults (₱13 / 4 km / ₱1.80 / 20% / 20%) on create per spec Assumptions.
- **Delete affordance**: disabled when `is_default || active_route_count > 0`, with an explanatory label; otherwise an `alert-dialog` confirmation precedes the request.
- No persistence beyond the server; no drafts (not in scope for a form this small).

## Scale assumptions

Single Administrator (thesis scale): ≤ dozens of fare configurations, no pagination; the list query fetches all rows; concurrency is a single operator, so last-write-wins on concurrent edits is accepted (server has no optimistic locking; the page refetches on invalidation).
