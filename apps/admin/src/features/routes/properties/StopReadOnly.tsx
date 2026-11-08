import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { pathFromConnections } from "@/lib/connections";
import { usePlottingStore } from "@/lib/plottingStore";
import { STOP_TYPE_LABELS } from "../stopLabels";
import { formatAttributionName } from "../attribution";
import type { StopShape } from "./types";

/**
 * One Stop's values as the standard details surface (ticket #47). Read-only
 * mode has no editable top group, so the whole panel is DetailList rows.
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
    <>
      <DetailSection title="Details" className="mt-0 border-t-0 pt-0">
        <DetailRow label="Stop">
          {index + 1} — {stop.name}
        </DetailRow>
        <DetailRow label="Type">{STOP_TYPE_LABELS[stop.type]}</DetailRow>
        <DetailRow label="Longitude">{lng}</DetailRow>
        <DetailRow label="Latitude">{lat}</DetailRow>
        <DetailRow label="Connected from">{nameOf(fromId)}</DetailRow>
        <DetailRow label="Connected to">{nameOf(toId)}</DetailRow>
        {stop.type !== "waiting_area" && (
          <DetailRow label="Guaranteed service">
            {(stop.is_guaranteed_service ?? true) ? "Yes" : "No"}
          </DetailRow>
        )}
        <DetailRow label="Landmark">{stop.landmark_hint ?? "—"}</DetailRow>
        <DetailRow label="Notes">{stop.notes ?? "—"}</DetailRow>
      </DetailSection>

      {(stop.created_by || stop.updated_by) && (
        <DetailSection title="Attribution">
          {stop.created_by && (
            <DetailRow label="Created by">
              {formatAttributionName(stop.created_by)}
            </DetailRow>
          )}
          {stop.updated_by && (
            <DetailRow label="Last written by">
              {formatAttributionName(stop.updated_by)}
            </DetailRow>
          )}
        </DetailSection>
      )}
    </>
  );
}
