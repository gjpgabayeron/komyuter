import { Banknote, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { FareConfigForm } from "@/features/fares/FareConfigForm";
import { FareConfigTable } from "@/features/fares/FareConfigTable";
import { useFareConfigsQuery } from "@/features/fares/queries";

export default function Fares() {
  const { data, isError, isLoading, refetch } = useFareConfigsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Fares follow the LTFRB formula: base fare plus ₱rate per km beyond the
          base distance.
        </p>
        <Button
          onClick={() => setCreateOpen(true)}
          aria-label="New fare configuration"
        >
          <Plus />
          New fare configuration
        </Button>
      </div>

      {isLoading ? (
        <div
          className="space-y-2"
          aria-busy="true"
          aria-label="Loading fare configurations"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="flex h-full items-center justify-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Banknote />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                Couldn't load fare configurations
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Check the server connection and try again.
              </EmptyDescription>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Banknote />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                No fare configurations yet
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Create the first fare configuration to set the fare formula used
                by routes.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <FareConfigTable configs={data} />
      )}

      <FareConfigForm open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
