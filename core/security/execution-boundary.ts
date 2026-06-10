import path from "node:path";
import { checkPermission, type PermissionMode } from "./permission.js";

export interface ExecutionBoundaryPolicy {
  cwd: string;
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ExecutionBoundaryDecision {
  allowed: boolean;
  reason: string;
  command?: string;
  resolvedCwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export class ExecutionBoundary {
  constructor(private readonly policy: ExecutionBoundaryPolicy) {}

  checkCommand(command: string, args: string[], mode: PermissionMode): ExecutionBoundaryDecision {
    const permission = checkPermission(mode, "execute");
    if (!permission.allowed) {
      return { allowed: false, reason: permission.reason, command };
    }
    if (!this.policy.allowedCommands.includes(command)) {
      return { allowed: false, reason: `Command not allowed: ${command}`, command };
    }
    if (args.some((arg) => /[;&|`$<>]/.test(arg))) {
      return { allowed: false, reason: "Unsafe shell metacharacter in command args", command };
    }
    return {
      allowed: true,
      reason: "allowed",
      command,
      resolvedCwd: path.resolve(this.policy.cwd),
      timeoutMs: this.policy.timeoutMs,
      maxOutputBytes: this.policy.maxOutputBytes
    };
  }
}
