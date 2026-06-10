import type { ToolDefinition } from "./types.js";

export const browserTool: ToolDefinition<{ action: "open" | "screenshot" | "status"; url?: string }, { action: string; status: string; url?: string }> = {
  name: "browser",
  description: "浏览器控制占位工具。需要外部授权的真实浏览器操作会返回待授权状态。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["open", "screenshot", "status"] },
      url: { type: "string" }
    },
    required: ["action"]
  },
  execute(args) {
    return { action: args.action, status: args.action === "status" ? "ready" : "requires_external_browser_permission", url: args.url };
  }
};
