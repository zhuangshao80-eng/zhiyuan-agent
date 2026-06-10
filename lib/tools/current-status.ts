import { listSubAgents } from "./subagent.js";
import type { ToolDefinition } from "./types.js";

export const currentStatusTool: ToolDefinition<Record<string, never>, { status: string; cwd?: string; subagents: ReturnType<typeof listSubAgents> }> = {
  name: "current_status",
  description: "查询当前 Agent 工具运行状态。",
  parameters: { type: "object", properties: {} },
  execute(_args, context) {
    return { status: "ready", cwd: context?.cwd, subagents: listSubAgents() };
  }
};
