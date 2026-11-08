export type CoordinatePair = [number, number];

export interface GeoPoint {
  type: "Point";
  coordinates: CoordinatePair;
}

export interface GeoLineString {
  type: "LineString";
  coordinates: CoordinatePair[];
}
