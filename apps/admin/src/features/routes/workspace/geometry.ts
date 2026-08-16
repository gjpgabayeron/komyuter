/**
 * Fixed desktop geometry tokens for the route workspace
 * (plan.md Geometry table; REFACTOR.md "no outer margins, gutters only
 * between plates"). Under the ADR-0015 layering the plates FLOAT over a
 * full-bleed map; these tokens fix their widths, so they still describe the
 * free map region that stays visible between them. There is NO gutter track
 * (`gutter: 0`) — the visual spacing between plates and map is the 12 px
 * `p-3` inset padding on each column cell, so the free region is simply
 * viewport − plate widths.
 *
 * Reference figures (rail collapsed): overview @ 1024 = 768; focus/edit
 * @ 1024 = 432, @ 1440 = 848, @ 1920 = 1328 — **workspace-width**
 * math (the strip right of the 48 px collapsed rail); at a literal 1024 px
 * window the workspace is 976 px, so the focus region is 384 and the gate
 * correctly guards (FR-004).
 */
export const WORKSPACE_GEOMETRY = {
  leftCol: 256,
  rightCol: 336,
  // No gutter track: the visual spacing between the floating plates and the
  // map comes from the 12 px `p-3` inset padding on each column cell — an
  // extra gutter would double-space the layout (see WorkspaceColumns).
  gutter: 0,
  minMapWidth: 400,
} as const;

export type WorkspaceMode = "overview" | "focus" | "edit";

/**
 * Width of the FREE MAP REGION — the strip between the floating plates that
 * is not covered by them (and the map the user actually interacts with).
 *
 * `viewport` is the workspace's own width — the measured container that
 * already sits right of the shell rail. Pass `railW = 0` in that case
 * (equivalently: full browser width with the real rail width). Both spell
 * the same physical layout, which the unit tests pin down.
 */
export function computeMapWidth(
  viewport: number,
  railW: number,
  mode: WorkspaceMode,
): number {
  const { leftCol, rightCol, gutter } = WORKSPACE_GEOMETRY;
  const chrome =
    mode === "overview" ? leftCol + gutter : leftCol + rightCol + 2 * gutter;
  return Math.max(0, viewport - railW - chrome);
}

/** True when the free map region would fall below the 400 px floor. */
export function isMapGateActive(mapWidth: number): boolean {
  return mapWidth < WORKSPACE_GEOMETRY.minMapWidth;
}
