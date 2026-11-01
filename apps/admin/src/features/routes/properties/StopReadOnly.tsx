import { usePlottingStore } from "@/lib/plottingStore";
import { pathFromConnections } from "@/lib/connections";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { STOP_TYPE_LABELS } from "../stopLabels";
import { formatAttributionName } from "../attribution";
import type { StopShape } from "./types";

/**
 * One Stop's values as plain text (ticket #47): what the read-only workspace
 * shows where the editor shows fields. No input, no switch, no delete — the
 * read-only property column is a reading surface, and nothing on it can submit.
 */
export function StopReadOnly({
  stop,
  index,
}: {
  stop: StopShape;
  index: number;
}) {
  const connections = usePlottingStore((s) => s.connections);
  const stops = usePlottingStore((s) => s.stops);
  const path = pathFromConnections(connections, stops);
  const pathIndex = path.stopIds.indexOf(stop.id);
  const lastIndex = path.stopIds.length - 1;
  const closedLoop = path.closed && path.stopIds.length >= 3;
  const fromId =
    closedLoop && pathIndex === 0
      ? path.stopIds[lastIndex]
      : pathIndex > 0
        ? path.stopIds[pathIndex - 1]
        : null;
  const toId =
    closedLoop && pathIndex === lastIndex
      ? path.stopIds[0]
      : pathIndex >= 0 && pathIndex < lastIndex
        ? path.stopIds[pathIndex + 1]
        : null;
  const nameOf = (id: string | null) =>
    id === null
      ? "None"
      : (stops.find((candidate) => candidate.id === id)?.name ?? "None");

  const [lng, lat] = stop.location;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground text-xs">Stop</dt>
        <dd className="min-w-0 truncate tabular-nums">
          {index + 1} — {stop.name}
        </dd>

        <dt className="text-muted-foreground text-xs">Type</dt>
        <dd>{STOP_TYPE_LABELS[stop.type]}</dd>

        <dt className="text-muted-foreground text-xs">Longitude</dt>
        <dd className="tabular-nums">{lng}</dd>

        <dt className="text-muted-foreground text-xs">Latitude</dt>
        <dd className="tabular-nums">{lat}</dd>

        <dt className="text-muted-foreground text-xs">Connected from</dt>
        <dd className="min-w-0 truncate">{nameOf(fromId)}</dd>

        <dt className="text-muted-foreground text-xs">Connected to</dt>
        <dd className="min-w-0 truncate">{nameOf(toId)}</dd>

        {stop.type !== "waiting_area" && (
          <>
            <dt className="text-muted-foreground text-xs">
              Guaranteed service
            </dt>
            <dd>{(stop.is_guaranteed_service ?? true) ? "Yes" : "No"}</dd>
          </>
        )}

        <dt className="text-muted-foreground text-xs">Landmark</dt>
        <dd className="min-w-0 truncate">{stop.landmark_hint ?? "—"}</dd>

        <dt className="text-muted-foreground text-xs">Notes</dt>
        <dd className="min-w-0 truncate">{stop.notes ?? "—"}</dd>
      </div>

      {/* The Attribution the editor shows too (ADR-0025) — values only. */}
      <div className="border-t pt-3">
        <SectionLabel>Attribution</SectionLabel>
        <dl className="mt-1.5 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Created by</dt>
            <dd className="truncate">
              {formatAttributionName(stop.created_by)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Last written by</dt>
            <dd className="truncate">
              {formatAttributionName(stop.updated_by)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
