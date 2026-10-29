import type { GeocodeHit } from "@komyuter/shared";
import { Marker } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";
import { SIGNBOARD_BLUE } from "./constants";
import { PoiPin } from "./PoiPin";
import { candidatesToDraw, pinSizeForZoom } from "../poiScope";

/**
 * One marker per search candidate, in the stop layer's size and weight.
 *
 * Signboard green-blue is the brand's plate colour (DESIGN.md) and the pin is
 * the shape language asked for: a searched place reads as "somewhere to go",
 * while the stop plates keep their square / circle / diamond grammar for route
 * furniture. Size, white keyline and the selected-stop outline on hover are
 * deliberately the same as a stop marker, so candidates sit in the map at the
 * same weight rather than floating above it.
 *
 * Each pin is a button: clicking one marks the place, moves the camera to it and
 * opens its popup (`PoiPopup`), which is where a stop gets added. The click is
 * stopped from reaching the map, or an Add-tool click would also drop a stop
 * underneath the pin.
 */
export function PoiCandidatesLayer() {
  const candidates = usePlottingStore((s) => s.poiCandidates);
  const hoverId = usePlottingStore((s) => s.poiHoverId);
  // The picked place is drawn by `RouteMap` as its own marker; keeping its
  // candidate pin would stack two markers on one coordinate. Keyed on `poiHit`,
  // not `poiSelection`: the card closing must not bring the small pin back while
  // the big marker is still there.
  const pickedId = usePlottingStore((s) => s.poiHit?.id ?? null);
  const zoom = usePlottingStore((s) => s.mapViewport?.zoom ?? null);
  const pinPx = pinSizeForZoom(zoom);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const setPoi = usePlottingStore((s) => s.setPoi);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);

  const visible = candidatesToDraw(candidates, pickedId);
  if (visible.length === 0) return null;

  const select = (hit: GeocodeHit) => {
    setPoi(hit.location, hit.name);
    requestPoiFocus({ kind: "point", location: hit.location });
    setPoiSelection(hit);
  };

  return (
    <>
      {visible.map((hit) => {
        const hovered = hit.id === hoverId;
        return (
          <Marker
            key={hit.id}
            longitude={hit.location[0]}
            latitude={hit.location[1]}
          >
            <div className="relative flex flex-col items-center">
              <button
                type="button"
                aria-label={`Show ${hit.name}`}
                data-poi-candidate={hit.id}
                onClick={(event) => {
                  event.stopPropagation();
                  select(hit);
                }}
                onMouseEnter={() => setPoiHoverId(hit.id)}
                onMouseLeave={() => setPoiHoverId(null)}
                onFocus={() => setPoiHoverId(hit.id)}
                onBlur={() => setPoiHoverId(null)}
                className={[
                  "flex cursor-pointer rounded-full",
                  "focus-visible:outline-foreground focus-visible:outline-2 focus-visible:outline-offset-2",
                  hovered && "outline-foreground outline-2 outline-offset-2",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <PoiPin size={pinPx} color={SIGNBOARD_BLUE} />
              </button>
              {hovered && (
                <span className="absolute top-full mt-0.5 max-w-40 truncate rounded-xs border border-[#1B6DB2] bg-white px-1 text-[11px] leading-4 font-medium text-[#1B6DB2]">
                  {hit.name}
                </span>
              )}
            </div>
          </Marker>
        );
      })}
    </>
  );
}
