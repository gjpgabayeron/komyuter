import type { StopType } from "@komyuter/shared";

/** Human labels for the three stop types (shared by list + properties UI). */
export const STOP_TYPE_LABELS: Record<StopType, string> = {
  terminal: "Terminal",
  major_stop: "Major stop",
  waiting_area: "Waiting area",
};
