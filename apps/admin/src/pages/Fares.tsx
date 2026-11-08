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
import { useFareAccess } from "@/features/auth/useCapabilities";
import type { FareConfigListItem } from "@/features/fares/api";
import { FareConfigForm } from "@/features/fares/FareConfigForm";
import { FareConfigTable } from "@/features/fares/FareConfigTable";
import { useFareConfigsQuery } from "@/features/fares/queries";

/**
 * The Fares surface. Without `FARES_EDIT` it is the same table — same columns,
 * same readings — with every mutating control omitted rather than disabled:
 * no New fare configuration, no edit, no reactivation, no deactivation, no
 * default toggle (ADR-0019 §9 M2b amendment, ticket #48). `useFareAccess()`
 * answers which of them exist; this page only renders the answers, and the
 * server refuses each mutation regardless of what is drawn.
 */
export default function Fares() {
  const { data, isError, isLoading, refetch } = useFareConfigsQuery();
  const fares = useFareAccess();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FareConfigListItem | null>(
    null,
  );

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Fares follow the LTFRB formula: base fare plus ₱rate per km beyond the
          base distance.
        </p>
        {fares.showCreate && (
          <Button
            onClick={() => setCreateOpen(true)}
            aria-label="New fare configuration"
          >
            <Plus />
            New fare configuration
          </Button>
        )}
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
              {/* An empty table owes the reader the next step only when there
                  is one to take. */}
              <EmptyDescription>
                {fares.showCreate
                  ? "Create the first fare configuration to set the fare formula used by routes."
                  : "Fares follow the LTFRB formula once an Account that may edit them has set a configuration."}
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <FareConfigTable
          configs={data}
          access={fares}
          onEdit={setEditingConfig}
        />
      )}

      {/* Neither control that opens this dialog exists without `FARES_EDIT`,
          so it stays shut — and the default toggle, which only lives here, is
          never offered. */}
      <FareConfigForm
        open={createOpen || editingConfig !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditingConfig(null);
          }
        }}
        config={editingConfig}
        showDefaultToggle={fares.showDefaultToggle}
      />
    </div>
  );
}
