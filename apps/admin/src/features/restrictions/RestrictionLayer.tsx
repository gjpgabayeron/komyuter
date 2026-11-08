import { memo, useEffect } from "react";
import { Flag, Play } from "lucide-react";
import { Marker, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { GeoLineString, RestrictionKind } from "@komyuter/shared";

import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  useDetoursQuery,
  useDirectionsQuery,
} from "@/features/routes/useRouteQueries";
import { useRestrictionsQuery } from "@/features/routes/useRouteQueries";
import { useDetourStore } from "@/features/detours/detourStore";
import {
  RESTRICTION_KIND_TEXT,
  restrictionColorFor,
} from "@/features/routes/map/constants";
import { nearestVertexIndex, restrictionLine } from "./restrictionHelpers";
import { inheritedMainRestrictions } from "./inheritance";
import { useRestrictionStore } from "./restrictionStore";

interface RestrictionFeature {
  type: "Feature";
  properties: {
    kind: "restriction" | "restriction-draft";
    restrictionId?: string;
    selected: boolean;
    color: string;
  };
  geometry: GeoLineString;
}

interface EndpointMarker {
  key: string;
  label: string;
  role: "start" | "end";
  restrictionId?: string;
  coordinate: [number, number];
  color: string;
  textColor: string;
  selected: boolean;
  line: GeoLineString;
  editable: boolean;
}

const RESTRICTION_LAYER_IDS = [
  "restriction-line",
  "restriction-band",
  "restriction-band-selected",
];

const EMPTY: RestrictionFeature[] = [];

/**
 * Draws saved restrictions and the live range being picked over the saved
 * Direction polyline. Restrictions are index ranges of the SAVED base line,
 * not the live draft: a draft edit can re-snap the path, and the indices the
 * server validates against are the ones already stored.
 */
export const RestrictionLayer = memo(function RestrictionLayer() {
  const map = useMap().current?.getMap();

  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const selectedId = useRestrictionStore((s) => s.selectedId);
  const fromIndex = useRestrictionStore((s) => s.fromIndex);
  const toIndex = useRestrictionStore((s) => s.toIndex);
  const kind = useRestrictionStore((s) => s.kind);
  const mode = useRestrictionStore((s) => s.mode);
  const editing = useRestrictionStore((s) => s.editing);
  const detourId = useRestrictionStore((s) => s.detourId);
  const detourOpen = useDetourStore((s) => s.open);
  const editDetourId = useDetourStore((s) => s.editDetourId);
  const scopeDetourId = detourOpen ? (editDetourId ?? detourId) : null;

  const { data: directions } = useDirectionsQuery(routeId);
  const { data: restrictions } = useRestrictionsQuery(directionId);
  const { data: detours } = useDetoursQuery(directionId);
  const direction =
    directions?.find((d) => d.direction_id === directionId) ?? null;
  const detour =
    detours?.find((item) => item.detour_id === scopeDetourId) ?? null;
  const scopedRestrictions = (restrictions ?? []).filter(
    (restriction) => restriction.detour_id === scopeDetourId,
  );
  const inherited =
    detour && direction
      ? inheritedMainRestrictions(
          direction.base_polyline,
          detour,
          restrictions ?? [],
        )
      : [];
  const visibleRestrictions = [...scopedRestrictions, ...inherited];
  const lineFor = (restriction: { detour_id: string | null }) =>
    restriction.detour_id === null
      ? direction?.base_polyline
      : detour?.detour_polyline;
  const draftLine =
    scopeDetourId !== null ? detour?.detour_polyline : direction?.base_polyline;
  const selectedRestriction =
    visibleRestrictions.find(
      (restriction) => restriction.restriction_id === selectedId,
    ) ?? null;

  const savedFeatures: RestrictionFeature[] = direction
    ? visibleRestrictions
        .filter(
          (restriction) =>
            restriction.is_active || restriction.restriction_id === selectedId,
        )
        .map<RestrictionFeature | null>((restriction) => {
          const line = lineFor(restriction);
          if (!line) return null;
          return {
            type: "Feature",
            properties: {
              kind: "restriction",
              restrictionId: restriction.restriction_id,
              selected: restriction.restriction_id === selectedId,
              color: restrictionColorFor(restriction.kind),
            },
            geometry: restrictionLine(line, restriction),
          };
        })
        .filter(
          (feature): feature is RestrictionFeature =>
            feature !== null && feature.geometry.coordinates.length >= 2,
        )
    : EMPTY;

  const draftGeometry =
    draftLine && fromIndex !== null && toIndex !== null
      ? restrictionLine(draftLine, {
          from_coord_index: fromIndex,
          to_coord_index: toIndex,
        })
      : null;

  const draftFeatures: RestrictionFeature[] =
    draftGeometry && draftGeometry.coordinates.length >= 2
      ? [
          {
            type: "Feature",
            properties: {
              kind: "restriction-draft",
              selected: true,
              color: restrictionColorFor(kind),
            },
            geometry: draftGeometry,
          },
        ]
      : EMPTY;

  const ensure = () => {
    if (!map) return false;
    ensureGeoJsonSource(map, "restriction-bands");
    ensureGeoJsonSource(map, "restriction-draft-band");
    const addLayer = (spec: Parameters<typeof map.addLayer>[0]) => {
      if (!map.getLayer(spec.id)) map.addLayer(spec);
    };
    addLayer(
      lineLayerSpec("restriction-band", {
        source: "restriction-bands",
        filter: [
          "all",
          ["==", "kind", "restriction"],
          ["==", "selected", false],
        ],
        color: ["get", "color"],
        width: 8,
        opacity: 1,
      }),
    );
    addLayer(
      lineLayerSpec("restriction-band-selected", {
        source: "restriction-bands",
        filter: [
          "all",
          ["==", "kind", "restriction"],
          ["==", "selected", true],
        ],
        color: ["get", "color"],
        width: 12,
        opacity: 1,
      }),
    );
    addLayer(
      lineLayerSpec("restriction-line", {
        source: "restriction-bands",
        filter: ["==", "kind", "restriction"],
        color: ["to-color", "#FFFFFF"],
        width: 4,
        opacity: 1,
      }),
    );
    addLayer(
      lineLayerSpec("restriction-draft-band", {
        source: "restriction-draft-band",
        filter: ["==", "kind", "restriction-draft"],
        color: ["get", "color"],
        width: 10,
        opacity: 1,
      }),
    );
    addLayer(
      lineLayerSpec("restriction-draft-line", {
        source: "restriction-draft-band",
        filter: ["==", "kind", "restriction-draft"],
        color: ["to-color", "#FFFFFF"],
        width: 5,
        opacity: 1,
      }),
    );
    return true;
  };

  const signature = () =>
    JSON.stringify({
      saved: savedFeatures.map((feature) => [
        feature.properties.selected,
        feature.properties.color,
        feature.properties.restrictionId,
        feature.geometry.coordinates,
      ]),
      draft: draftFeatures[0]
        ? [
            draftFeatures[0].properties.color,
            draftFeatures[0].geometry.coordinates,
          ]
        : [],
    });

  const apply = () => {
    setSourceData(map!, "restriction-bands", savedFeatures);
    setSourceData(map!, "restriction-draft-band", draftFeatures);
  };

  useDrawWhenReady(
    map,
    [
      routeId,
      directionId,
      direction,
      restrictions,
      selectedId,
      fromIndex,
      toIndex,
      kind,
      detour,
    ],
    ensure,
    signature,
    apply,
    [
      "restriction-band",
      "restriction-band-selected",
      "restriction-line",
      "restriction-draft-band",
      "restriction-draft-line",
    ],
  );

  useEffect(() => {
    if (!map) return;
    const onClick = (event: MapLayerMouseEvent) => {
      if (!useRestrictionStore.getState().editing) return;
      if (usePlottingStore.getState().tool !== "select") return;
      const restrictionId = event.features?.[0]?.properties?.restrictionId;
      const restriction = scopedRestrictions.find(
        (candidate) => candidate.restriction_id === restrictionId,
      );
      if (restriction) useRestrictionStore.getState().select(restriction);
    };
    map.on("click", RESTRICTION_LAYER_IDS, onClick);
    return () => {
      map.off("click", RESTRICTION_LAYER_IDS, onClick);
    };
  }, [map, scopedRestrictions]);

  const selectedRangeChanged =
    selectedRestriction !== null &&
    (fromIndex !== selectedRestriction.from_coord_index ||
      toIndex !== selectedRestriction.to_coord_index);
  const draftRangeActive =
    mode === "picking" || selectedId === null || selectedRangeChanged;

  const endpointMarkers: EndpointMarker[] = [];
  const addEndpoint = (
    restrictionId: string | undefined,
    role: "start" | "end",
    index: number,
    kind: RestrictionKind,
    selected: boolean,
    line: GeoLineString,
    editable: boolean,
  ) => {
    const coordinate = line.coordinates[index];
    if (!coordinate) return;
    endpointMarkers.push({
      key: `${restrictionId ?? "draft"}-${role}`,
      label: role === "start" ? "Start" : "End",
      role,
      restrictionId,
      coordinate,
      color: restrictionColorFor(kind),
      textColor: RESTRICTION_KIND_TEXT[kind],
      selected,
      line,
      editable,
    });
  };

  for (const restriction of visibleRestrictions) {
    if (!restriction.is_active && restriction.restriction_id !== selectedId) {
      continue;
    }
    if (restriction.restriction_id === selectedId && draftRangeActive) {
      continue;
    }
    const line = lineFor(restriction);
    if (!line) continue;
    const selected = restriction.restriction_id === selectedId;
    const editable = restriction.detour_id === scopeDetourId;
    addEndpoint(
      restriction.restriction_id,
      "start",
      restriction.from_coord_index,
      restriction.kind,
      selected,
      line,
      editable,
    );
    addEndpoint(
      restriction.restriction_id,
      "end",
      restriction.to_coord_index,
      restriction.kind,
      selected,
      line,
      editable,
    );
  }

  if (draftRangeActive && draftLine) {
    const draftId = selectedId ?? undefined;
    if (fromIndex !== null) {
      addEndpoint(draftId, "start", fromIndex, kind, true, draftLine, true);
    }
    if (toIndex !== null) {
      addEndpoint(draftId, "end", toIndex, kind, true, draftLine, true);
    }
  }

  const moveMarker = (
    marker: EndpointMarker,
    lngLat: { lng: number; lat: number },
  ) => {
    if (!marker.editable) return;
    const index = nearestVertexIndex([lngLat.lng, lngLat.lat], marker.line);
    if (index === null) return;
    const state = useRestrictionStore.getState();
    if (marker.restrictionId && state.selectedId !== marker.restrictionId) {
      const restriction = scopedRestrictions.find(
        (candidate) => candidate.restriction_id === marker.restrictionId,
      );
      if (restriction) state.select(restriction);
    }
    useRestrictionStore.getState().moveEndpoint(marker.role, index);
  };

  return (
    <>
      {endpointMarkers.map((marker) => (
        <Marker
          key={marker.key}
          longitude={marker.coordinate[0]}
          latitude={marker.coordinate[1]}
          anchor="bottom"
          draggable={editing && marker.editable}
          onDragEnd={(event: { lngLat: { lng: number; lat: number } }) =>
            moveMarker(marker, event.lngLat)
          }
        >
          <span
            title={marker.label}
            className={[
              "flex items-center gap-1 border-2 border-white px-1.5 py-0.5 text-[10px] leading-none font-semibold",
              marker.role === "start" ? "rounded-full" : "rounded-[3px]",
              marker.selected
                ? "ring-foreground scale-110 ring-2"
                : "opacity-80",
              editing && marker.editable
                ? "cursor-grab active:cursor-grabbing"
                : "pointer-events-none",
            ].join(" ")}
            style={{
              backgroundColor: marker.color,
              color: marker.textColor,
            }}
          >
            {marker.role === "start" ? (
              <Play className="size-2.5 fill-current" />
            ) : (
              <Flag className="size-2.5" />
            )}
            {marker.selected ? marker.label : null}
          </span>
        </Marker>
      ))}
    </>
  );
});
