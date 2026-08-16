import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Applies the 3D camera when the basemap style is "3d" (the liberty style
 * shown in a tilted perspective, per OpenFreeMap's own demo): tilts the map
 * to pitch 60 and allows rotation; switching back to a flat style levels the
 * camera. Mirrors OpenFreeMap's liberty-3d demo behavior.
 */
export function PerspectiveController() {
  const map = useMap().current?.getMap();
  const baseStyle = usePlottingStore((s) => s.layers.baseStyle);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    if (baseStyle === "3d") {
      map.easeTo({ pitch: 60, bearing: 0, duration: 500 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [map, baseStyle]);

  return null;
}
