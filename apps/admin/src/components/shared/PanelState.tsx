import type { ReactNode } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PanelStateProps {
  /** Standard non-interactive skeleton (no shimmer-on-click affordance). */
  loading?: boolean;
  /** Standard empty copy, with an optional meaningful action. */
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  /** Shown in the `empty` state: a real affordance the Administrator can take. */
  emptyAction?: { label: string; onSelect: () => void };
  /** Load failure: standard wording + retry. */
  error?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
}

/**
 * ONE loading | empty(action?) | error(onRetry) | loaded treatment for every
 * list and panel in the workspace (contracts/ui-patterns.md §2, US3). Every
 * panel renders through this single component so the four states read
 * identically everywhere — no bespoke skeleton variants, no bare dashes
 * doubling as "loading" (FR-008/FR-009).
 */
export function PanelState({
  loading,
  empty,
  emptyTitle = "Nothing here yet",
  emptyHint,
  emptyAction,
  error,
  errorMessage = "Something went wrong loading this.",
  onRetry,
  children,
  className,
}: PanelStateProps) {
  if (loading) {
    return (
      <div className={cn("space-y-2 py-2", className)} aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1.5 px-2 py-6 text-center",
          className,
        )}
        role="alert"
      >
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        <p className="text-sm font-medium">{errorMessage}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1.5 px-2 py-6 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyHint && (
          <p className="text-muted-foreground text-xs">{emptyHint}</p>
        )}
        {emptyAction && (
          <Button
            type="button"
            size="sm"
            className="mt-1"
            onClick={emptyAction.onSelect}
          >
            {emptyAction.label}
          </Button>
        )}
      </div>
    );
  }

  return <div className={cn(className)}>{children}</div>;
}

/** Convenience export so callers can skip the busy icon when not needed. */
export function PanelLoading({ className }: { className?: string }) {
  return <LoaderCircle className={cn("animate-spin", className)} aria-hidden />;
}
