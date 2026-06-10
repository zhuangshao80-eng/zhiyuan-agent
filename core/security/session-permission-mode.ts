import type { PermissionMode } from "./permission.js";

export interface SessionPermissionState {
  sessionId: string;
  mode: PermissionMode;
  updatedAt: string;
}

export class SessionPermissionModeRegistry {
  private readonly modes = new Map<string, SessionPermissionState>();

  get(sessionId: string): PermissionMode {
    return this.modes.get(sessionId)?.mode ?? "limited";
  }

  set(sessionId: string, mode: PermissionMode): SessionPermissionState {
    const state: SessionPermissionState = { sessionId, mode, updatedAt: new Date().toISOString() };
    this.modes.set(sessionId, state);
    return state;
  }

  list(): SessionPermissionState[] {
    return [...this.modes.values()];
  }
}
