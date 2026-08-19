import { Route as RouteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

interface EmptyStateProps {
  onCreateRoute: () => void;
}

/**
 * Guidance overlay shown when the workspace has zero routes (US2): the warm
 * map canvas stays visible as the backdrop (ADR-0015) with a single centered
 * plate whose create action is already focused — Enter activates it
 * (keyboard contract). No plotting controls are active.
 */
export function EmptyState({ onCreateRoute }: EmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <Empty className="pointer-events-auto max-w-md rounded-[4px] border bg-white">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RouteIcon />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            Plot a route
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            Pick a route from the Routes panel to start plotting, or create a
            new one.
          </EmptyDescription>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button autoFocus onClick={onCreateRoute}>
              Create new route
            </Button>
            <Button
              variant="outline"
              disabled
              aria-disabled
              title="Coming soon"
            >
              Import JSON dataset
              <Badge variant="outline" className="ml-1.5">
                Coming soon
              </Badge>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
