import { AutomationRunner, type AutomationStep } from "../desk/automation.js";
import type { ToolDefinition } from "./types.js";

export const automationTool: ToolDefinition<{ action: "save" | "run" | "get"; id: string; name?: string; steps?: AutomationStep[] }, unknown> = {
  name: "automation_tool",
  description: "保存、读取和执行 Desk 自动化流程定义。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["save", "run", "get"] },
      id: { type: "string" },
      name: { type: "string" },
      steps: { type: "array", items: { type: "object" } }
    },
    required: ["action", "id"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("automation_tool requires agentDir");
    const runner = new AutomationRunner(context.agentDir);
    if (args.action === "get") return runner.get(args.id);
    if (args.action === "run") return runner.run(args.id);
    return runner.save({ id: args.id, name: args.name ?? args.id, steps: args.steps ?? [] });
  }
};
