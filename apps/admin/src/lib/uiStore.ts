import { create } from "zustand";

export type SidebarMode = "expanded" | "collapsed" | "hover";

interface UiState {
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarMode: "expanded",
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
}));
