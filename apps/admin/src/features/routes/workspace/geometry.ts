/**
 * Fixed desktop geometry tokens for the route workspace
 * (specs/008 plan.md Geometry table; "no outer margins, gutters only
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
  /** The context column — revealed over the free region's left edge while a
   *  search session has something to show (ADR-0024). */
  contextCol: 320,
  rightCol: 336,
  // No gutter track: the visual spacing between the floating plates and the
  // map comes from the 12 px `p-3` inset padding on each column cell — an
  // extra gutter would double-space the layout (see WorkspaceColumns).
  gutter: 0,
  minMapWidth: 400,
} as const;

export type WorkspaceMode = "overview" | "focus" | "edit";

/** Every state the workspace can be in, including the one with no plates. */
export type WorkspaceState = WorkspaceMode | "empty";

export interface WorkspaceLayoutInput {
  state: WorkspaceState;
  /** Whether the right column has a plate to show. A declined plate collapses
   *  its track, so the map gets the width back (the confident-hit case). */
  rightPlate: boolean;
  /** Whether the context column is revealed. Only the edit state can reveal it:
   *  a place found with no draft open has nowhere to go (ADR-0024). */
  contextPlate?: boolean;
}

export interface WorkspaceTracks {
  /** `grid-template-columns` for the five-track grid, gutter slots included. */
  template: string;
  /** Rendered width of the left and right tracks, in px. */
  left: number;
  right: number;
}

/** The context column's place in the layout: visible or collapsed. */
export interface WorkspaceContext {
  visible: boolean;
  width: number;
}

export interface WorkspaceLayout {
  /** The configuration this workspace is in — named, so callers can switch on it. */
  variant: WorkspaceLayoutVariant;
  tracks: WorkspaceTracks;
  /** Horizontal space the plates occlude, per side. */
  insets: { left: number; right: number };
  context: WorkspaceContext;
}

/** Four workspace states, plus the one plate configuration that is not a state. */
export type WorkspaceLayoutVariant = WorkspaceState | "edit+search";

/**
 * The workspace's plate configuration, as data (ADR-0024).
 *
 * One derivation owns three answers that used to be spelled out in three
 * places — which tracks the grid renders, how much space the plates occlude,
 * and which layout variant is on screen. The grid, the camera padding and the
 * search scope all read this, so they cannot disagree about where the map is.
 */
export function deriveWorkspaceLayout(
  input: WorkspaceLayoutInput,
): WorkspaceLayout {
  const { leftCol, contextCol, rightCol, gutter } = WORKSPACE_GEOMETRY;
  const showLeft = input.state !== "empty";
  const showRight =
    (input.state === "focus" || input.state === "edit") && input.rightPlate;
  // Only edit can reveal the context column, and it never coexists with the
  // right plate (plateSlotsFor): the session inset is stops + context.
  const showContext = input.state === "edit" && input.contextPlate === true;
  const left = showLeft ? leftCol : 0;
  const right = showRight ? rightCol : 0;
  const variant: WorkspaceLayoutVariant = showContext
    ? "edit+search"
    : input.state;
  // The context plate OVERLAYS the free region's left edge; it adds no track.
  // Why: a track would shift the floating chrome — the search pill — sideways
  // the instant results appear, moving the input under the caret.
  const template = `${left}px ${showLeft ? gutter : 0}px minmax(0, 1fr) ${
    showRight ? gutter : 0
  }px ${right}px`;
  return {
    variant,
    tracks: { template, left, right },
    insets: { left: left + (showContext ? contextCol : 0), right },
    context: { visible: showContext, width: showContext ? contextCol : 0 },
  };
}

/** Width of the map the plates leave visible, clamped at zero. */
export function visibleMapWidth(
  layout: WorkspaceLayout,
  viewport: number,
): number {
  return Math.max(0, viewport - layout.insets.left - layout.insets.right);
}

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
  // One source of truth: the gate measures the same derivation the grid renders.
  const layout = deriveWorkspaceLayout({
    state: mode,
    rightPlate: mode !== "overview",
  });
  return visibleMapWidth(layout, viewport - railW);
}

/** True when the free map region would fall below the 400 px floor. */
export function isMapGateActive(mapWidth: number): boolean {
  return mapWidth < WORKSPACE_GEOMETRY.minMapWidth;
}
