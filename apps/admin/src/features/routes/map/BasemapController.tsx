import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";
import { OVERLAY_LAYER_PREFIXES } from "./constants";

/**
 * Applies the basemap layer controls to the raster layer: visibility (on/off)
 * and `raster-opacity`. Rendered INSIDE `<Map>` (where useMap() resolves) and
 * re-applies on every style load, so switching the basemap style can never
 * leave the layer uncontrolled.
 */
export function BasemapController() {
  const map = useMap().current?.getMap();
  const baseOpacity = usePlottingStore((s) => s.layers.baseOpacity);

  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (!map.isStyleLoaded()) return;
      // Fade the BASEMAP layers (the map's own style layers) to the chosen
      // opacity. The route lines / overview overlays are skipped so they
      // always stay fully opaque. Overwriting the opacity paint props with a
      // constant is safe for basemap layers (their defaults are 1.0).
      const layers = map.getStyle()?.layers ?? [];
      for (const layer of layers) {
        if (
          OVERLAY_LAYER_PREFIXES.some((prefix) => layer.id.startsWith(prefix))
        ) {
          continue;
        }
        switch (layer.type) {
          case "background":
            map.setPaintProperty(layer.id, "background-opacity", baseOpacity);
            break;
          case "fill":
            map.setPaintProperty(layer.id, "fill-opacity", baseOpacity);
            break;
          case "line":
            map.setPaintProperty(layer.id, "line-opacity", baseOpacity);
            break;
          case "symbol":
            map.setPaintProperty(layer.id, "icon-opacity", baseOpacity);
            map.setPaintProperty(layer.id, "text-opacity", baseOpacity);
            break;
          case "raster":
            map.setPaintProperty(layer.id, "raster-opacity", baseOpacity);
            break;
          default:
            break;
        }
      }
    };
    apply();
    map.on("styledata", apply);
    map.on("load", apply);
    return () => {
      map.off("styledata", apply);
      map.off("load", apply);
    };
  }, [map, baseOpacity]);

  return null;
}
