import type { DraftPayload } from "@/lib/draft";
import {
  hasPermission,
  isPermissionName,
  permissionMask,
  type Permission,
} from "@komyuter/shared";

/**
 * The dashboard's capability module (ADR-0019 §9, M2b amendment).
 *
 * The server resolves the Account's Effective Permission Set; this module is
 * the single place the SPA turns that set into the five questions the
 * dashboard asks of it. Nothing here computes authorization — it reads the
 * server's answer (ADR-0019: "the UI must consume the server's answer rather
 * than compute its own"). Every hidden affordance still has a server refusal
 * behind it; a capability is an affordance, never the boundary.
 */
export const CAPABILITIES = [
  "editRoutes",
  "editFares",
  "exportDataset",
  "searchPlaces",
  "manageAccounts",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type Capabilities = Record<Capability, boolean>;

/**
 * One Permission per question, declared once. `ROUTES_EDIT` is the editing
 * Permission of the Route Workspace; its absence is the Read-only Workspace
 * (CONTEXT.md) — not a mode, and not a Permission of its own.
 */
const CAPABILITY_PERMISSION: Record<Capability, Permission> = {
  editRoutes: "ROUTES_EDIT",
  editFares: "FARES_EDIT",
  exportDataset: "EXPORT_DATASET",
  searchPlaces: "MAPBOX_GEOSERVICES",
  manageAccounts: "ADMIN_MANAGE",
};

/** Every capability false — no Account, no session, an empty set. */
export function noCapabilities(): Capabilities {
  return {
    editRoutes: false,
    editFares: false,
    exportDataset: false,
    searchPlaces: false,
    manageAccounts: false,
  };
}

/**
 * The five answers for an Effective Permission Set. Unknown names are ignored
 * rather than answered true, so a wire value this build does not know can only
 * ever narrow what the SPA offers.
 */
export function capabilitiesFromPermissions(
  permissions: readonly Permission[],
): Capabilities {
  const mask = permissionMask(permissions.filter(isPermissionName));
  const capabilities = noCapabilities();
  for (const capability of CAPABILITIES) {
    capabilities[capability] = hasPermission(
      mask,
      CAPABILITY_PERMISSION[capability],
    );
  }
  return capabilities;
}

/**
 * The Read-only Workspace (CONTEXT.md): the workspace as an Account without
 * `ROUTES_EDIT` sees it. It is not a mode the Account toggles and not a
 * Permission of its own — it is the absence of one.
 */
export function isReadOnlyWorkspace(capabilities: Capabilities): boolean {
  return !capabilities.editRoutes;
}

export interface WorkspaceShortcuts {
  save: boolean;
  undo: boolean;
  redo: boolean;
}

/**
 * Everything the workspace chrome decides from the capability set alone.
 *
 * The two plate flags are complementary on purpose: the action bar slot holds
 * the plotting tools for an editor and the read-only status plate for everyone
 * else, so the slot is never empty and never offers a tool that cannot be used.
 * Place search is here because it is the other affordance that is absent —
 * a search spends the gated Mapbox token, so it answers to
 * `MAPBOX_GEOSERVICES` rather than to `ROUTES_EDIT`. The map itself keeps
 * working without it.
 */
export interface WorkspaceAccess {
  readOnly: boolean;
  /** The plotting action bar (tool toggle, undo/redo, layer controls). */
  showPlotActionBar: boolean;
  /** The read-only status plate that replaces it. */
  showReadOnlyPlate: boolean;
  /** The save control and `mod+s`. */
  showSave: boolean;
  /** Keyboard shortcuts: save, undo and redo write, so a read-only Account has none. */
  shortcuts: WorkspaceShortcuts;
  showPlaceSearch: boolean;
}

export function workspaceAccess(capabilities: Capabilities): WorkspaceAccess {
  const readOnly = isReadOnlyWorkspace(capabilities);
  return {
    readOnly,
    showPlotActionBar: !readOnly,
    showReadOnlyPlate: readOnly,
    showSave: !readOnly,
    shortcuts: { save: !readOnly, undo: !readOnly, redo: !readOnly },
    showPlaceSearch: capabilities.searchPlaces,
  };
}

/**
 * May this Account write the client-local Draft (FR-014)?
 *
 * This covers the whole draft lifecycle — writing it, and clearing it when the
 * edits are gone. Both are writes to someone's unsaved work, so a read-only
 * Account does neither: a Draft written by an editor whose Role changed
 * underneath them is left exactly as it was.
 */
export function writesDraft(capabilities: Capabilities): boolean {
  return capabilities.editRoutes;
}

/**
 * Is the stored Draft offered for restore when a route reopens? Never in the
 * read-only workspace: restoring would put unsaveable edits on the surface and
 * then drop them again, so the offer is absent rather than disabled.
 */
export function offersDraftRestore(
  capabilities: Capabilities,
  draft: DraftPayload | null,
): boolean {
  return writesDraft(capabilities) && draft !== null;
}
