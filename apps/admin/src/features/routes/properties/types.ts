import type { Attribution, StopType } from "@komyuter/shared";

export interface StopShape {
  id: string;
  name: string;
  type: StopType;
  location: [number, number];
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
  /** Read-only provenance shown in the stop editor (ADR-0025); absent for a
   *  stop that has not been saved yet. */
  created_by?: Attribution;
  updated_by?: Attribution;
}

export const STOP_TYPES: StopType[] = [
  "terminal",
  "major_stop",
  "waiting_area",
];
