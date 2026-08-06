/**
 * What the plot canvas currently has selected (Q3/A: the right-side properties
 * panel is visible only when an element is selected). Pure helpers — the store
 * just holds a Selection value.
 */
export type Selection =
  { type: "none" } | { type: "stop"; stopId: string } | { type: "polyline" };

export function selectStop(stopId: string): Selection {
  return { type: "stop", stopId };
}

export const selectPolyline: Selection = { type: "polyline" };

export const clearSelection: Selection = { type: "none" };

export function isStopSelected(selection: Selection, stopId: string): boolean {
  return selection.type === "stop" && selection.stopId === stopId;
}
