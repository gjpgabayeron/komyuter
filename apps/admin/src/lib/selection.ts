/**
 * What the plot canvas currently has selected (the right-side properties
 * plate shows the stop editor only when a stop is selected). Pure helpers —
 * the store just holds a Selection value.
 *
 * NOTE: a map-polyline click is NOT a selection — it enters the workspace
 * `focus` state (focusedRouteId in the plotting store), so this model only
 * ever carries "none" or a stop.
 */
export type Selection = { type: "none" } | { type: "stop"; stopId: string };

export function selectStop(stopId: string): Selection {
  return { type: "stop", stopId };
}

export const clearSelection: Selection = { type: "none" };

export function isStopSelected(selection: Selection, stopId: string): boolean {
  return selection.type === "stop" && selection.stopId === stopId;
}
