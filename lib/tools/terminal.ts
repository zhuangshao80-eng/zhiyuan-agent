import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

const execFileAsync = promisify(execFile);
const ALLOWED_COMMANDS = new Set(["pwd", "ls", "rg", "git", "node", "npm"]);

export interface TerminalArgs {
  command: string;
  args?: string[];
  timeoutMs?: number;
}

export const terminalTool: ToolDefinition<TerminalArgs, { stdout: string; stderr: string; command: string }> = {
  name: "terminal",
  description: "在安全边界内执行白名单终端命令，带超时和工作目录沙箱。",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "白名单命令：pwd/ls/rg/git/node/npm" },
      args: { type: "array", items: { type: "string" } },
      timeoutMs: { type: "number" }
    },
    required: ["command"]
  },
  async execute({ command, args = [], timeoutMs = 5000 }, context) {
    if (!ALLOWED_COMMANDS.has(command)) {
      await context?.auditLog?.record({ action: "tool.terminal", subject: "agent", resource: command, outcome: "denied", detail: "command not allowed" });
      throw new Error(`Command not allowed: ${command}`);
    }
    if (args.some((arg) => /[;&|`$<>]/.test(arg))) {
      await context?.auditLog?.record({ action: "tool.terminal", subject: "agent", resource: command, outcome: "denied", detail: "unsafe shell metacharacter" });
      throw new Error("Unsafe shell metacharacter in terminal args");
    }

    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: context?.cwd ?? process.cwd(),
      timeout: Math.min(Math.max(timeoutMs, 500), 15_000),
      maxBuffer: 1024 * 512,
      shell: false
    });
    await context?.auditLog?.record({ action: "tool.terminal", subject: "agent", resource: command, outcome: "allowed", detail: args.join(" ") });
    return { command: [command, ...args].join(" "), stdout: String(stdout), stderr: String(stderr) };
  }
};
