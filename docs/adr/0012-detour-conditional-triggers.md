# ADR-0012: Detour conditional triggers (WITHDRAWN)

- **Status**: WITHDRAWN (2026-11-07)
- **Date**: originally written 2026-08-19
- **Related**: ADR-0008 (a detour replaces the base segment), ADR-0009 (no ETA)

## Original proposal

Store recurring weekly windows and a landmark condition on each detour, then
resolve which detours are active per navigation request.

## Withdrawal

The admin cannot know the passenger's current context, so a trigger editor and
a preview endpoint in the admin surface were the wrong place to decide whether
an alternative route applies. The trigger columns, shared resolver, preview
endpoint and Check activation panel were removed end to end. A saved
alternative route is now authored as geometry, stops, instructions and an
active flag; activation remains a future navigation concern outside the admin
surface.

No trigger fields exist in the current `Detour` model or export dataset.
