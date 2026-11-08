import { describe, expect, it } from "vitest";

import { filterDetours, filterRoutes } from "@/lib/headerSearch";

const routes = [
  { name: "Calaparan to Calumpang", short_name: "R1" },
  { name: "Super via Ledesma", short_name: "S2" },
];

const detours = [
  {
    label: "Super loop",
    detour_stops: [{ name: "Iloilo Terminal Market" }],
  },
  {
    label: "Bridge bypass",
    detour_stops: [{ name: "Jalandoni Bridge" }],
  },
];

describe("header popover search", () => {
  it("matches a route by name or short code, case-insensitively", () => {
    expect(filterRoutes(routes, "super")).toEqual([routes[1]]);
    expect(filterRoutes(routes, "r1")).toEqual([routes[0]]);
    expect(filterRoutes(routes, "")).toEqual(routes);
  });

  it("matches a detour by label or stop name", () => {
    expect(filterDetours(detours, "bridge")).toEqual([detours[1]]);
    expect(filterDetours(detours, "terminal")).toEqual([detours[0]]);
    expect(filterDetours(detours, "nothing")).toEqual([]);
  });
});
