import { MapPinned, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { RouteSummary } from "./routesApi";

export function RouteRow({
  route,
  active,
  onOpen,
  onDelete,
}: {
  route: RouteSummary;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={(props) => (
          <div
            {...props}
            className={cn(
              "flex items-center gap-1 rounded-lg border p-1.5 transition-colors",
              active
                ? "border-primary/50 bg-primary/5"
                : "hover:bg-muted border-transparent",
            )}
          >
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Open ${route.name}`}
              className="min-w-0 flex-1 text-left"
            >
              <span className="text-foreground block truncate text-sm font-medium">
                {route.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <Badge
                  variant={route.is_active ? "default" : "outline"}
                  className="h-4 px-1 text-[10px] font-medium"
                >
                  {route.is_active ? "Active" : "Inactive"}
                </Badge>
                <span
                  className={cn(
                    "text-muted-foreground text-[11px] tabular-nums",
                    route.direction_count === 0 && "text-muted-foreground/70",
                  )}
                >
                  {route.direction_count > 0
                    ? `${route.direction_count} direction${route.direction_count === 1 ? "" : "s"}`
                    : "Not plotted"}
                </span>
              </span>
            </button>
          </div>
        )}
      />
      <ContextMenuContent alignOffset={4} className="min-w-40">
        <ContextMenuItem onClick={onOpen}>
          <MapPinned className="size-4" />
          Open route
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete route
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
