# Contract: Canonical UI Labels

**Spec**: FR-005, FR-006, FR-019 · **Arbiter file**: `apps/admin/src/lib/labels.ts` (implemented identically)

Every surface in the route workspace reads labels only through this registry — no inline literal labels, no per-file copies, no variant spellings. This contract is what SC-004 ("100% of reviewers confirm the same field carries the same label in every surface") tests against.

## Label Registry (initial seed — extends during implementation)

| `LabelKey`                     | Canonical string         | Former variants (to replace)                                                       |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------- |
| `routeCode`                    | `Route code`             | —                                                                                  |
| `shortName`                    | `Short name`             | —                                                                                  |
| `color`                        | `Color`                  | `Colour` (`NewRouteDialog.tsx:123`, `properties/RouteGroup.tsx:92,125`)            |
| `stops`                        | `Stops`                  | —                                                                                  |
| `sectionStops`                 | `Stops along this route` | inline headings in `RouteList`                                                     |
| `detours`                      | `Alternative routes`     | `Detours` captions (Glossary term: Detour; admin action label: Alternative routes) |
| `lastUpdated`                  | `Last updated`           | —                                                                                  |
| `additionalDistance`           | `Additional distance`    | —                                                                                  |
| `commuterInstruction`          | `Commuter instruction`   | —                                                                                  |
| `driverInstruction`            | `Driver instruction`     | —                                                                                  |
| `notableStops`                 | `Notable stops`          | —                                                                                  |
| `searchStops` / `searchRoutes` | `Search…`                | per-list placeholder drift                                                         |

Specified format: add rows as surfaces are adopted; keys are a typed union so a misspelled key fails typecheck.

## Save Copy (part of `labels.ts`)

| Key                                                                               | String             | Used by                                                                                                |
| --------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `save.idle`                                                                       | `Save changes`     | Base SaveButton (`RouteWorkspace.tsx`), Detour SaveButton (`DetourGroup.tsx` — replaces "Save detour") |
| `save.saving`                                                                     | `Saving…`          | Both, in-flight                                                                                        |
| `save.saved`                                                                      | `Saved just now`   | `StatusBar` plate, 4 s — both editors                                                                  |
| `conflict.title` / `conflict.body` / `conflict.loadLatest` / `conflict.keepLocal` | one shared wording | `LoadLatestDialog` for route _and_ detour saves (FR-003)                                               |

## Rules

1. One canonical string per key; tests assert value uniqueness (no two keys → same string).
2. Section headings use the workspace `SectionLabel` component; field labels use one `Label` style (FR-006) — never a second heading size.
3. All visible copy uses `docs/CONTEXT.md` terms ("Administrator", "Route", "Direction", "Stop", "Detour", "Detour Stop"); "alternative route" is the admin label for Detour (FR-019).
4. Help/tooltip/status text must describe the controls that exist (FR-014/US6#3) — stale docstrings fixed in the same pass.
