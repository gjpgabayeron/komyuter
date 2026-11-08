# Contract: Fare Configurations Admin API

Interface between the Fares page (`apps/admin`) and the Fastify admin API (`apps/server`, `/api/admin/*`). All responses use the envelope `{ success: true, data }` / `{ success: false, error: { code, message } }`; all endpoints require the admin auth guard (Bearer token). Error codes come from `apps/server/src/api/errors.ts`.

## Endpoints

| Method | Path                                    | Purpose                                           | Request body              | Success                                      |
| ------ | --------------------------------------- | ------------------------------------------------- | ------------------------- | -------------------------------------------- |
| GET    | `/api/admin/fare-configs`               | List all fare configurations                      | —                         | 200 → array                                  |
| GET    | `/api/admin/fare-configs/:fareConfigId` | Read one                                          | —                         | 200 → object                                 |
| POST   | `/api/admin/fare-configs`               | Create (un-sets previous default if `is_default`) | `CreateFareConfigPayload` | 201 → object                                 |
| PUT    | `/api/admin/fare-configs/:fareConfigId` | Update (partial)                                  | `UpdateFareConfigPayload` | 200 → object                                 |
| DELETE | `/api/admin/fare-configs/:fareConfigId` | **Deactivate** (soft delete)                      | —                         | 200 → `{ fare_config_id, is_active: false }` |

## FareConfiguration (serialized, list & single)

```ts
{
  fare_config_id: string; // slug `fare-<label>` (server-disambiguated)
  label: string;
  base_fare: number; // ₱
  base_distance_km: number; // km
  rate_per_km: number; // ₱/km
  student_discount_pct: number; // 0–100
  senior_discount_pct: number; // 0–100
  is_default: boolean;
  is_active: boolean;
  active_route_count: number; // NEW (this feature): active Routes referencing this config
  created_at: string; // ISO
  updated_at: string; // ISO
}
```

### Contract addition (this feature)

`active_route_count` is added to the **list** serializer: count of rows in `routes` where `fare_config_id = :id AND is_active = true`. The single-item GET may omit it (page does not need it there); the implementation SHOULD include it for symmetry — plan defaults to including it only in the list.

## Request payloads (from `@komyuter/shared` schemas — reused, never reimplemented)

```ts
// POST createFareConfigSchema
{
  label: string;                // min 1
  base_fare: number;            // non-negative
  base_distance_km: number;     // non-negative
  rate_per_km: number;          // non-negative
  student_discount_pct: number; // 0–100
  senior_discount_pct: number;  // 0–100
  is_default?: boolean;         // default false; setting true un-sets the previous default
}
// PUT updateFareConfigSchema = createFareConfigSchema.partial() + { is_active?: boolean }
//   Setting is_default: true un-sets the previous default.
//   NEW INVARIANT (this feature): the update MUST NOT leave the row with
//   is_default === true && is_active === false — the server rejects that result
//   (see "PUT behavior" below). The page enforces the same rule inline (FR-015).
```

## PUT behavior (this feature)

Before applying the patch, the handler rejects (409 `CONFLICT`) an update that would leave the row as an **inactive default**: `body.is_active === false` while the result would still be default (`existing.is_default` or `body.is_default === true`). Message: "Cannot set the default fare configuration inactive; reactivate it or assign another default first." This makes FR-015 (default always active) true at the API boundary, not just in the page.

## DELETE behavior (this feature)

Sequence: (1) look up the configuration → `404 NOT_FOUND` if missing; (2) **NEW** if any active Route references it → `409 CONFLICT` ("Cannot deactivate fare configuration referenced by active Routes"); (3) existing guard: if it is the sole default → `409 CONFLICT` ("Cannot deactivate the last default fare configuration"); (4) otherwise set `is_active = false` and return the deactivated object.

**Client behavior**: the page disables the delete action when `active_route_count > 0` or `is_default` (defense-in-depth: a race — Route created after the list was fetched — still hits the server guard and is surfaced as an honest error toast, list unchanged).

## Error codes observed by the page

| Code               | HTTP | Meaning for the page                                                         |
| ------------------ | ---- | ---------------------------------------------------------------------------- |
| `UNAUTHORIZED`     | 401  | Sign-in expired — handled globally by `lib/api.ts` (redirect to `/login`)    |
| `NOT_FOUND`        | 404  | Configuration deleted elsewhere — refetch list, show toast                   |
| `CONFLICT`         | 409  | Delete blocked (referenced by active Route, or sole default) — show message  |
| `VALIDATION_ERROR` | 422  | Malformed payload — should not occur with client validation; surface message |
| `NETWORK`          | —    | Server unreachable — error toast, keep form values (FR-008)                  |

## Server tests required (written FIRST — TDD)

In `apps/server/tests/integration/crud.test.ts` (reusing `helpers.ts` + `buildApp` + `auth()` + route-seeding pattern):

1. POST a fare config, POST a Route with `fare_config_id` = config, `is_active = true` → DELETE config → `409 CONFLICT`; config still `is_active: true`.
2. Same but Route `is_active = false` → DELETE config → `200`, `is_active: false` (reference from an inactive Route does not block).
3. DELETE the sole default → `409 CONFLICT` (existing behavior, regression guard).
4. GET list → `active_route_count` is `0` for unreferenced, `1` for active-referenced, `0` for inactive-only-referenced.
5. PUT `{ is_active: false }` on the default config → `409 CONFLICT`; config unchanged.
6. PUT `{ is_active: false, is_default: true }` on a non-default config → `409 CONFLICT`; config unchanged.
