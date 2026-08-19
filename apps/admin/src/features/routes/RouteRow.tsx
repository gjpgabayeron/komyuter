import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
    <div
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
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
          aria-label={`Edit ${route.name}`}
          onClick={onOpen}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "hover:bg-destructive/10 hover:text-destructive",
          )}
          aria-label={`Delete ${route.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
