import { Eye } from "lucide-react";
import { Plate } from "@/components/shared/Plate";
import { useAuth } from "@/features/auth/auth";

/**
 * The action bar's read-only variant (ticket #47): the workspace as an Account
 * without `ROUTES_EDIT` sees it, the centred plate that would hold the
 * plotting tools becomes a status plate instead. No tool toggle, no undo/redo,
 * no layer controls and no save — nothing is offered *disabled*, because a
 * control mounted as disabled still says the workspace has a mode to switch
 * into. It names the Role so a Viewer can see why the surface is quiet.
 */
export function ReadOnlyPlate() {
  const { user } = useAuth();
  const roleName = user?.role.name;

  return (
    <Plate
      role="status"
      className="text-muted-foreground flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-xs font-medium"
    >
      <Eye className="size-3.5 shrink-0" aria-hidden />
      <span>Read-only{roleName ? ` · ${roleName}` : ""}</span>
    </Plate>
  );
}
