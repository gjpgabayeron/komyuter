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

/**
 * The same mapping read the other way: a Permission the dashboard's surfaces
 * declare, answered by the one capability that models it. Derived from
 * `CAPABILITY_PERMISSION` so there is still exactly one statement of the
 * mapping, and a Permission can never be answered by two capabilities.
 */
const PERMISSION_CAPABILITY: ReadonlyMap<Permission, Capability> = new Map(
  CAPABILITIES.map(
    (capability) => [CAPABILITY_PERMISSION[capability], capability] as const,
  ),
);

/**
 * Does the Account hold the Permission an affordance declares?
 *
 * A surface states the Permission it needs (`sections.ts` does, and the Fares
 * controls do); the dashboard asks its capability. This function is the only
 * bridge between the two, so no surface answers the question by scanning
 * `user.permissions` itself. A Permission this build does not model is held by
 * nobody — the SPA cannot answer a question it never asked the server.
 */
export function holdsPermission(
  capabilities: Capabilities,
  permission: Permission,
): boolean {
  const capability = PERMISSION_CAPABILITY.get(permission);
  return capability !== undefined && capabilities[capability];
}

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
 * What the Fares surface offers (ADR-0019 §9 M2b amendment).
 *
 * Without `FARES_EDIT` the page keeps its table and loses every mutating
 * control: no create, no edit, no deactivation, no default toggle. Each control
 * is named here rather than read off the page, so the degradation is one
 * decision with one answer per control — and every one of them is omitted, not
 * mounted disabled, because a disabled control still claims the surface has a
 * mode to switch into.
 */
export interface FareAccess {
  readOnly: boolean;
  /** "New fare configuration" and the form it opens. */
  showCreate: boolean;
  /** The row's edit control — also the way a configuration is reactivated. */
  showEdit: boolean;
  /** Deactivation: the dashboard's only removal, and it never hard-deletes. */
  showDeactivate: boolean;
  /** The form's "Set as default" switch. */
  showDefaultToggle: boolean;
  /** The table's Actions column, which exists only to hold the controls. */
  showActionsColumn: boolean;
}

export function fareAccess(capabilities: Capabilities): FareAccess {
  const mayEdit = capabilities.editFares;
  return {
    readOnly: !mayEdit,
    showCreate: mayEdit,
    showEdit: mayEdit,
    showDeactivate: mayEdit,
    showDefaultToggle: mayEdit,
    showActionsColumn: mayEdit,
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
