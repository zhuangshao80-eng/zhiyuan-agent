import type { ToolDefinition } from "./types.js";

export const stopTaskTool: ToolDefinition<{ taskId: string }, { taskId: string; stopped: boolean }> = {
  name: "stop_task",
  description: "请求停止正在执行或排队的任务。",
  parameters: {
    type: "object",
    properties: { taskId: { type: "string" } },
    required: ["taskId"]
  },
  execute(args) {
    return { taskId: args.taskId, stopped: true };
  }
};
