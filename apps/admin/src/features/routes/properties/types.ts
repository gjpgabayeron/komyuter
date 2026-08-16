import type { StopType } from "@komyuter/shared";

export interface StopShape {
  id: string;
  name: string;
  type: StopType;
  location: [number, number];
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

export const STOP_TYPES: StopType[] = [
  "terminal",
  "major_stop",
  "waiting_area",
];
