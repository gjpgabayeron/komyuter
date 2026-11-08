# ADR-0033: Route header and detour switcher

- **Status**: ACCEPTED (implemented 2026-11-03)
- **Date**: 2026-11-03
- **Implements**: milestone `M3` (`docs/ROADMAP.md`)
- **Related**: ADR-0014/ADR-0015 (workspace layers and plates), ADR-0019 (Permissions), ADR-0023 (documentation scope)

## Context

The workspace carried alternative routes in a bottom-left card under the stop
list. That gave a secondary feature the same persistent visual weight as the
primary plotting surface, and it consumed the left column's vertical space.
The Figma route-page frame moves alternative-route management into the shell
header, following the branching idea's interaction model rather than a
prominent panel.

The shell header already existed (`apps/admin/src/app/Header.tsx`) and already
reflected the open Route. It sits outside `RouteWorkspaceProvider`, which owns
the dirty-draft guard, so moving route navigation into it needed an explicit
seam.

## Decision

1. **The shell header is 48 px on every section and spans the full page width above the rail.** The rail begins below the header, so it is full-height within the content row rather than the whole page (ADR-0014 amendment, 2026-11-04). The K mark lives at the header's left; the rail no longer renders `BrandMark`.
2. **`/routes` shows a route chip and, while editing, a branch chip.** The header reads `K / Routes / <route> / <branch>`: `/` glyphs separate every crumb, the route chip is present in focus and edit (skeleton pulse and disabled while the detail resolves), and the branch chip is present in edit only, labelled `Main` immediately rather than waiting for `routeMeta`. Outside `/routes` the header reads `K / <section>` and the K links to `/`.
3. **Detour management lives in the branch popover**: edit, activate/deactivate
   and permanently delete. The workspace keeps the editor, not the list. This
   also closes the missing detour-delete surface that the milestone's
   "every entity can be removed" criterion requires.
4. **Alternative-route switching confirms a dirty draft.** Both route switching
   and detour switching go through a styled confirmation and preserve the
   existing draft. The header requests navigation through
   `lib/workspaceBridge.ts`; the provider owns the guard. A header click can
   never bypass the leave confirmation.
5. **Read-only Accounts keep the lists and search, and lose Add, kebab, delete
   and New route.** The existing capability rules still decide this; the header
   is not a second authorization computation.
6. **The bottom-left `DetourSidebar`/`DetourList` are removed.** The left column
   returns to the stop list.

## Consequences

- The header becomes a navigation surface, not just a title bar. Any future
  header command must go through the bridge, or it will silently drop a dirty
  draft.
- The popover is a plate, not a shadowed menu: white ground, ≤ 4 px corners, a
  hairline border. The dark Supabase reference is a structure reference only.
- The route switcher and the branch switcher share one 288 px shell, so the two
  management surfaces cannot drift apart.
- `Header` now reads plotting and detour stores directly. That is acceptable
  because it is a shell surface over the same workspace state, but it is not a
  place to add a second copy of workspace policy.
