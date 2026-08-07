export const fareConfigKeys = {
  all: ["fare-configs"] as const,
};

export const routeKeys = {
  all: ["routes"] as const,
  detail: (routeId: string) => ["routes", routeId] as const,
  directions: (routeId: string) => ["routes", routeId, "directions"] as const,
  directionStops: (directionId: string) =>
    ["directions", directionId, "stops"] as const,
};
