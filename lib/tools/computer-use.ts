import type { ToolDefinition } from "./types.js";

export const computerUseTool: ToolDefinition<{ action: "screenshot" | "click" | "type" | "key"; x?: number; y?: number; text?: string }, { action: string; status: string }> = {
  name: "computer_use",
  description: "本机 GUI 操作占位工具，真实鼠标键盘操作必须经外部授权通道执行。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["screenshot", "click", "type", "key"] },
      x: { type: "number" },
      y: { type: "number" },
      text: { type: "string" }
    },
    required: ["action"]
  },
  execute(args) {
    return { action: args.action, status: "requires_gui_permission" };
  }
};
