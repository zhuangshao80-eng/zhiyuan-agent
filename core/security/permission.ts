export type PermissionLevel = "read" | "write" | "execute";
export type PermissionMode = "trusted" | "limited" | "sandbox";

const modePermissions: Record<PermissionMode, PermissionLevel[]> = {
  trusted: ["read", "write", "execute"],
  limited: ["read", "write"],
  sandbox: ["read"]
};

export interface PermissionDecision {
  allowed: boolean;
  level: PermissionLevel;
  mode: PermissionMode;
  reason: string;
}

export function checkPermission(mode: PermissionMode, level: PermissionLevel): PermissionDecision {
  const allowed = modePermissions[mode].includes(level);
  return {
    allowed,
    level,
    mode,
    reason: allowed ? `${mode} allows ${level}` : `${mode} denies ${level}`
  };
}

export function maxPermissionForMode(mode: PermissionMode): PermissionLevel[] {
  return [...modePermissions[mode]];
}
