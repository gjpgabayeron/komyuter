import { Map } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function Overview() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Map />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            Welcome to the network
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            The Overview will show every route, direction, and stop across
            Iloilo. Route plotting arrives in a later milestone.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    </div>
  );
}
