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
 * Reference figures (rail collapsed): overview @ 1024 = 744; focus/edit
 * @ 1024 = 464, @ 1440 = 880, @ 1920 = 1360 — **workspace-width** math (the
 * strip right of the 48 px collapsed rail); at a literal 1024 px window the
 * workspace is 976 px, so the focus region is 416 and the gate correctly
 * guards (FR-004, 420 px floor).
 */
export const WORKSPACE_GEOMETRY = {
  /** The stops dock. Equal to every other column, so the editor reads as a
   *  three-strip grid with one shared column width. */
  leftCol: 280,
  /** The context column — docked immediately beside the stops column while a
   *  search session has something to show (Figma "Route Page Search State
   *  Layout", node 120:2). It overlays the map's left edge, so revealing it
   *  never resizes the GL canvas or moves the search field. Because it is the
   *  same width as the right column it replaces, the visible map width does
   *  not change when a search opens. */
  contextCol: 280,
  /** The properties / focus dock, full height by default. */
  rightCol: 280,
  // No gutter track: the visual spacing between the floating plates and the
  // map comes from the 12 px `p-3` inset padding on each column cell — an
  // extra gutter would double-space the layout (see WorkspaceColumns).
  gutter: 0,
  /** The `p-3` breathing room each column cell carries. The visible-region
   *  padding adds it to the occluded width, so a fit never kisses a plate. */
  columnInset: 12,
  /** Free map width below which the workspace gates. Raised from 400 to 420
   *  with the 280 px columns: at the documented 1024 px window the map is
   *  416 px, so the gate still fires exactly where the docs say it should. */
  minMapWidth: 420,
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

/** Pixel padding that frames camera moves inside the unoccluded map region. */
export interface CameraPadding {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WorkspaceLayout {
  /** The configuration this workspace is in — named, so callers can switch on it. */
  variant: WorkspaceLayoutVariant;
  tracks: WorkspaceTracks;
  /** Horizontal space the plates occlude, per side. */
  insets: { left: number; right: number };
  context: WorkspaceContext;
  /**
   * How far the floating bottom toolbar must move right so it stays centred in
   * the map the admin can actually see. The results plate covers the free
   * region's left edge, so its centre moves by half the plate's width. The
   * toolbar and the plate share one transition, so they move as one gesture.
   */
  chromeOffset: number;
  /**
   * The one visible-region measure (ADR-0024): the occluded width plus the
   * 12 px column inset on each side. Camera fits apply it as the map's
   * padding, and search scopes its answers to it, so neither can frame or name
   * a place underneath a plate.
   */
  padding: CameraPadding;
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
  const inset = WORKSPACE_GEOMETRY.columnInset;
  return {
    variant,
    tracks: { template, left, right },
    insets: { left: left + (showContext ? contextCol : 0), right },
    context: { visible: showContext, width: showContext ? contextCol : 0 },
    chromeOffset: showContext ? contextCol / 2 : 0,
    padding: {
      left: left + (showContext ? contextCol : 0) + inset,
      right: right + inset,
      top: inset,
      bottom: inset,
    },
  };
}

/**
 * Horizontal pixels the camera pans when the padding changes from `from` to
 * `to`, keeping the centre of the visible region fixed.
 *
 * Padding moves the visible region's centre by half the difference between
 * its left and right insets; a positive value means the camera must travel
 * west so the content appears to move east. Opening the search plate on the
 * edit layout (properties yields, context reveals) is 280 px: (572 − 12 −
 * (292 − 292)) / 2. This is the number the reveal's single padded `easeTo`
 * moves by, not a hand-tuned constant.
 */
export function revealPanPixels(
  from: CameraPadding,
  to: CameraPadding,
): number {
  return (to.left - to.right - (from.left - from.right)) / 2;
}

/** True when two paddings describe the same visible region. */
export function paddingEquals(a: CameraPadding, b: CameraPadding): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom
  );
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

/** True when the free map region would fall below the 420 px floor. */
export function isMapGateActive(mapWidth: number): boolean {
  return mapWidth < WORKSPACE_GEOMETRY.minMapWidth;
}
