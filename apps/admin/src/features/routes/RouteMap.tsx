import { useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Map from "react-map-gl/maplibre";
import { getTileSource, ILOILO_CITY } from "@/lib/tiles";

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "route-sign-basemap": getTileSource(),
  },
  layers: [
    {
      id: "route-sign-basemap",
      type: "raster",
      source: "route-sign-basemap",
    },
  ],
};

interface Viewport {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface RouteMapProps {
  className?: string;
  /** Overlay layers (path/stops) rendered above the map, added in US1+. */
  children?: React.ReactNode;
}

/**
 * Full-bleed MapLibre base map for the Route Plotting page (Q1/B layout).
 * Owns its viewport; later phases lift the viewport into the plotting store
 * when the map needs to react to external actions (e.g. "zoom to route").
 */
export function RouteMap({ className, children }: RouteMapProps) {
  const [viewport, setViewport] = useState<Viewport>({
    longitude: ILOILO_CITY[0],
    latitude: ILOILO_CITY[1],
    zoom: 13,
  });

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <Map
        {...viewport}
        onMove={(event) =>
          setViewport({
            longitude: event.viewState.longitude,
            latitude: event.viewState.latitude,
            zoom: event.viewState.zoom,
          })
        }
        mapStyle={BASE_STYLE}
        style={{ width: "100%", height: "100%" }}
      />
      {children}
    </div>
  );
}
