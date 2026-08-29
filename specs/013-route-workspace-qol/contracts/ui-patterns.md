# Contract: UI Patterns

**Spec**: FR-001…FR-004 (save), FR-008/009 (panel states), FR-010/011 (parity + keyboard), FR-014/015 (affordances + confirmations), FR-016 (WCAG AA) · **Arbiter components**: `apps/admin/src/components/shared/{SaveButton,PanelState,ConfirmDialog}.tsx`

Four workspace conventions. Each encodes exactly one pattern so surfaces stop inventing their own (agnostic of which store powers the underlying operation).

## 1. Save control (`SaveButton`)

- **One primary save affordance per active editor surface, never two save-looking controls visible at once.**
  - Base editor: the Save control in the page chrome row (`RouteWorkspace.tsx`) — kept in place, but rendered with the shared `SaveButton`; `PlotActionBar`'s docstring that falsely claims the bar holds "save" is corrected.
  - Detour editor: the save button inside `DetourGroup` (properties rail) — rendered with the same `SaveButton`.
- Label idle/saving/saved from `SAVE_COPY` (`labels.ts`): `Save changes` → `Saving…` → success plate via `StatusBar` ("Saved just now", 4 s).
- In-flight: disabled + `Saving…`; on success the 4 s plate; on conflict the shared conflict notice + `LoadLatestDialog` (FR-003) — same copy for route and detour saves.
- No save-looking control may be inert: the base icon-only button currently _without_ a text label gains the same label treatment (FR-014).

## 2. Panel states (`PanelState`)

- One component renders `loading | empty(action?) | error(onRetry) | loaded`.
  - `loading` = standard skeleton (no interaction).
  - `empty` = standard empty copy + optional meaningful action (e.g. "Add alternative route").
  - `error` = standard wording + retry.
  - `loaded` = content.
- Absent values render "Not set" through `displayValue` (`lib/format.ts`); `0` renders `0` — never "Not set", never a "—" that doubles as a loading placeholder (FR-009).
- Adoption: `RouteList` (stops sidebar), `DetourList`/`DetourSidebar`, `FocusPlate`, properties panels.

## 3. Confirmation pattern (`ConfirmDialog`)

- One shell: `title`, `message`, `confirmLabel`, `destructive?`, `onConfirm`, `onCancel`.
- Adopted by all five dialogs: stop delete, route delete, detour delete, leave-with-unsaved (`LeaveConfirmDialog`), save-conflict recovery (`LoadLatestDialog`).
- Identical visual structure and animation treatment in all five (FR-015); Esc/cancel and focus-trap behavior identical (FR-016).

## 4. Keyboard contract (FR-004/010/011/016)

| Shortcut                 | Base editor                                                | Detour editor                                                                                         | Focus mode / dialog open                                                   |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `mod+s`                  | Save (existing)                                            | **Save via detour gate** (new — binding is the visible button's entry point; never silently disabled) | No-op or intercepted by dialog (dialog keeps focus)                        |
| `mod+z` / `mod+shift+z`  | Undo / redo (existing)                                     | Same, detour history stack (existing detour bindings kept; gap closed only for `mod+s`)               | Dialog-focused                                                             |
| `esc`                    | Step down: detour editor → route editor → focus (existing) | —                                                                                                     | Closes dialog first (existing DOM-probe pattern extended to other hotkeys) |
| ArrowUp/ArrowDown / drag | Reorder stops (existing, `RouteList`)                      | **Reorder detour stops** (new — same semantics)                                                       | —                                                                          |

Rules: a shortcut is never silently swallowed while an editor is open (FR-004); interactions identical to the visible control they mirror (FR-010); every touched surface stays operable by keyboard alone (FR-016/SC-010).
