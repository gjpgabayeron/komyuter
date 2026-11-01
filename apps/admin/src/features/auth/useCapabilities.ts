import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth";
import {
  capabilitiesFromPermissions,
  fareAccess,
  offersDetourEditing,
  workspaceAccess,
  type Capabilities,
  type FareAccess,
  type WorkspaceAccess,
} from "@/lib/capabilities";

/**
 * The Account's capabilities, read from the Effective Permission Set the
 * server resolves for the session (`GET /api/admin/me`, ADR-0019 §7).
 *
 * The SPA never derives authorization itself — this hook is a thin reader over
 * `useAuth()`; the decision logic lives in the pure `lib/capabilities` module.
 * Before the server has answered there is no Account, so the empty set applies
 * and the dashboard offers nothing mutating until it knows better.
 */
export function useCapabilities(): Capabilities {
  const { user } = useAuth();
  const permissions = user?.permissions;
  return useMemo(
    () => capabilitiesFromPermissions(permissions ?? []),
    [permissions],
  );
}

/** What the Route Workspace offers this Account (read-only when `ROUTES_EDIT` is absent). */
export function useWorkspaceAccess(): WorkspaceAccess {
  const capabilities = useCapabilities();
  return useMemo(() => workspaceAccess(capabilities), [capabilities]);
}

/** What the Fares surface offers this Account (read-only when `FARES_EDIT` is absent). */
export function useFareAccess(): FareAccess {
  const capabilities = useCapabilities();
  return useMemo(() => fareAccess(capabilities), [capabilities]);
}

/**
 * May this Account open or edit an alternative route? The Route Workspace's
 * `ROUTES_EDIT` question again, named for the detour surfaces that ask it.
 */
export function useDetourEditing(): boolean {
  const capabilities = useCapabilities();
  return useMemo(() => offersDetourEditing(capabilities), [capabilities]);
}
