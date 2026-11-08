import { create } from "zustand";
import type { DetourEntity } from "@/features/routes/routesApi";

export interface DetourPreview {
  detour: DetourEntity;
  longitude: number;
  latitude: number;
}

interface DetourPreviewState {
  preview: DetourPreview | null;
  show: (detour: DetourEntity, at: readonly [number, number]) => void;
  hide: () => void;
}

/**
 * A read-only preview of a saved alternative, opened by clicking its line or
 * stop marker while the main route is focused. It deliberately does NOT open
 * the editor: the popup carries the CTA that does that.
 */
export const useDetourPreviewStore = create<DetourPreviewState>((set) => ({
  preview: null,
  show: (detour, at) =>
    set({
      preview: { detour, longitude: at[0], latitude: at[1] },
    }),
  hide: () => set({ preview: null }),
}));
