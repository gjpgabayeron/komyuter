/**
 * The route page's navigation commands, exposed to the shell header.
 *
 * The header lives above `RouteWorkspaceProvider`, so it cannot call the
 * provider's dirty-draft guard directly. The provider registers its guard
 * here; the header only requests. Every command therefore passes through the
 * same leave confirmation the workspace's own Back/Esc path uses.
 */
export interface WorkspaceBridge {
  /** Switch to another Route, after the current draft's guard. */
  switchRoute: (routeId: string) => void;
  /** Open the New Route dialog (guarded by the caller's own state). */
  openNewRoute: () => void;
  /** Return to the route overview, after the current draft's guard. */
  goOverview: () => void;
}

let bridge: WorkspaceBridge | null = null;

export function registerWorkspaceBridge(next: WorkspaceBridge | null): void {
  bridge = next;
}

export function getWorkspaceBridge(): WorkspaceBridge | null {
  return bridge;
}
