import type { RestrictionKind } from "@komyuter/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plate } from "@/components/shared/Plate";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { usePlottingStore } from "@/lib/plottingStore";
import { formatAttributionName } from "@/features/routes/attribution";
import {
  useDetoursQuery,
  useRestrictionsQuery,
} from "@/features/routes/useRouteQueries";
import { RESTRICTION_KIND_LABELS } from "./restrictionHelpers";
import { useRestrictionStore } from "./restrictionStore";

const KINDS: RestrictionKind[] = ["no_loading", "no_unloading", "both"];

/**
 * Right rail while restriction mode is active. The editor is a draft; the
 * workspace Save commits it. The left rail owns selection and creation.
 */
export function RestrictionPanel() {
  const directionId = usePlottingStore((s) => s.directionId);
  const draftDirty = usePlottingStore((s) => s.draftDirty);
  const { data: allRestrictions = [] } = useRestrictionsQuery(directionId);
  const detoursQuery = useDetoursQuery(directionId);
  const detourId = useRestrictionStore((s) => s.detourId);
  const restrictions = allRestrictions.filter(
    (restriction) => restriction.detour_id === detourId,
  );

  const mode = useRestrictionStore((s) => s.mode);
  const selectedId = useRestrictionStore((s) => s.selectedId);
  const fromIndex = useRestrictionStore((s) => s.fromIndex);
  const toIndex = useRestrictionStore((s) => s.toIndex);
  const kind = useRestrictionStore((s) => s.kind);
  const note = useRestrictionStore((s) => s.note);
  const isActive = useRestrictionStore((s) => s.isActive);
  const saving = useRestrictionStore((s) => s.saving);
  const lastError = useRestrictionStore((s) => s.lastError);
  const setKind = useRestrictionStore((s) => s.setKind);
  const setNote = useRestrictionStore((s) => s.setNote);
  const setActive = useRestrictionStore((s) => s.setActive);

  const detour =
    detoursQuery.data?.find((item) => item.detour_id === detourId) ?? null;
  const selected =
    restrictions.find((item) => item.restriction_id === selectedId) ?? null;
  const canEdit = !draftDirty;
  const editorOpen =
    mode === "picking" || selectedId !== null || fromIndex !== null;

  const instruction =
    mode === "picking" && fromIndex === null
      ? "Click the start point on the route."
      : mode === "picking" && fromIndex !== null && toIndex === null
        ? "Click the end point on the route."
        : fromIndex !== null && toIndex !== null && fromIndex === toIndex
          ? "Pick a second, different point."
          : null;

  return (
    <aside
      aria-label="Restrictions"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="md"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-y-0 border-r-0"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-foreground text-base font-semibold">
              Restrictions
            </h2>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {detourId ? (detour?.label ?? "Alternative route") : "Main route"}{" "}
              · {restrictions.length} saved
            </p>
          </div>
        </header>

        <div className="overlay-scrollbar mt-3 -mr-3 -ml-1 min-h-0 flex-1 overflow-x-clip overflow-y-auto pr-3 pl-1">
          {draftDirty ? (
            <p role="status" className="text-muted-foreground text-xs">
              Save the route before editing restrictions — ranges refer to the
              saved path.
            </p>
          ) : null}

          {!editorOpen ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Select a restriction in the left list or create a new one.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {selectedId ? "Edit restriction" : "New restriction"}
              </p>

              {instruction ? (
                <p role="status" className="text-muted-foreground text-xs">
                  {instruction}
                </p>
              ) : null}

              <fieldset
                disabled={!canEdit || saving}
                className="space-y-2 border-0 p-0"
              >
                <div className="grid gap-1">
                  <Label htmlFor="restriction-kind" className="text-[11px]">
                    Type
                  </Label>
                  <select
                    id="restriction-kind"
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as RestrictionKind)
                    }
                    className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                  >
                    {KINDS.map((option) => (
                      <option key={option} value={option}>
                        {RESTRICTION_KIND_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="restriction-note" className="text-[11px]">
                    Note
                  </Label>
                  <Input
                    id="restriction-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional context for this range"
                    className="h-8 text-xs"
                  />
                </div>

                {selectedId ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Active</span>
                    <Switch
                      checked={isActive}
                      onCheckedChange={setActive}
                      aria-label="Active restriction"
                    />
                  </div>
                ) : null}
              </fieldset>

              {lastError ? (
                <p role="alert" className="text-destructive text-xs">
                  {lastError}
                </p>
              ) : null}

              <p className="text-muted-foreground text-[11px]">
                Save changes in the toolbar.
              </p>

              {selected ? (
                <DetailSection>
                  <DetailRow label="Type">
                    {RESTRICTION_KIND_LABELS[selected.kind]}
                  </DetailRow>
                  {selected.created_by && (
                    <DetailRow label="Created by">
                      {formatAttributionName(selected.created_by)}
                    </DetailRow>
                  )}
                  {selected.updated_by && (
                    <DetailRow label="Last written by">
                      {formatAttributionName(selected.updated_by)}
                    </DetailRow>
                  )}
                </DetailSection>
              ) : null}
            </div>
          )}
        </div>
      </Plate>
    </aside>
  );
}
