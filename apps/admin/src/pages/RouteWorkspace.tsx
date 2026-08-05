import { Route } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function RouteWorkspace() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Route />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            No route selected
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            Pick a route from the sidebar to open the workspace, or create a new
            route to start plotting.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    </div>
  );
}
