import type { ToolDefinition } from "./types.js";

export const workflowTool: ToolDefinition<{ name: string; steps: Array<{ tool: string; args?: Record<string, unknown> }> }, { name: string; plannedSteps: number }> = {
  name: "workflow_tool",
  description: "工作流编排工具，默认禁用；用于规划多工具执行步骤。",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      steps: { type: "array", items: { type: "object" } }
    },
    required: ["name", "steps"]
  },
  execute(args) {
    return { name: args.name, plannedSteps: args.steps.length };
  }
};
