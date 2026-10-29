import { Plate } from "@/components/shared/Plate";
import { usePlottingStore } from "@/lib/plottingStore";
import { DetourList } from "./DetourList";

/**
 * The dedicated BOTTOM-LEFT sidebar for alternative routes: a self-contained
 * card under the stops sidebar listing the open direction's detours, with the
 * per-detour actions (edit, eye, activate, delete) and "Add alternative
 * route". Visible only while a direction is open (edit mode); the right
 * properties rail no longer hosts the nested list.
 */
export function DetourSidebar() {
  const directionId = usePlottingStore((s) => s.directionId);
  if (directionId === null) return null;

  return (
    <div className="flex max-h-[40%] min-h-0 shrink-0 flex-col">
      <Plate
        padded="sm"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-b-0 pb-4"
      >
        <DetourList directionId={directionId} />
      </Plate>
    </div>
  );
}
