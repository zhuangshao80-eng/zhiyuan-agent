import { create } from "zustand";
import type { AppMetadata } from "../../../../shared/app";
import type { EngineStatus } from "../../../../shared/types";

interface AppState {
  metadata: AppMetadata | null;
  engineStatus: EngineStatus | null;
  activeRoute: "chat" | "agents" | "settings";
  setMetadata: (metadata: AppMetadata) => void;
  setEngineStatus: (status: EngineStatus) => void;
  setActiveRoute: (route: AppState["activeRoute"]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  metadata: null,
  engineStatus: null,
  activeRoute: "chat",
  setMetadata: (metadata) => set({ metadata }),
  setEngineStatus: (engineStatus) => set({ engineStatus }),
  setActiveRoute: (activeRoute) => set({ activeRoute })
}));
