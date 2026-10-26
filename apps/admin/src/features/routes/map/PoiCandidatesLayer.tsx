import { Marker } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * One dot per search candidate, drawn on the map itself.
 *
 * This is the half of the Google-Maps behaviour the list cannot give: seeing
 * where the others are before committing. The dot under the pointer is
 * emphasised (`poiHoverId`), so hovering a row reads on the map as well as in
 * the list. Rendering nothing when the set is empty is deliberate — the layer
 * costs nothing between searches, and clearing candidates clears the map.
 */
export function PoiCandidatesLayer() {
  const candidates = usePlottingStore((s) => s.poiCandidates);
  const hoverId = usePlottingStore((s) => s.poiHoverId);

  if (candidates.length === 0) return null;

  return (
    <>
      {candidates.map((hit) => {
        const hovered = hit.id === hoverId;
        return (
          <Marker
            key={hit.id}
            longitude={hit.location[0]}
            latitude={hit.location[1]}
            anchor="center"
          >
            <span
              aria-hidden
              data-poi-candidate={hit.id}
              className={
                hovered
                  ? "block size-3.5 rounded-full border-2 border-white bg-[#C98A1B] shadow-sm ring-2 ring-[#C98A1B]"
                  : "block size-2.5 rounded-full border-2 border-white bg-[#C98A1B]/80"
              }
            />
          </Marker>
        );
      })}
    </>
  );
}
