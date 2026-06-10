import type { ToolDefinition } from "./types.js";

export const dmTool: ToolDefinition<{ recipient: string; message: string }, { queued: boolean; recipient: string }> = {
  name: "dm_tool",
  description: "私信工具，默认禁用；启用后可进入外部消息发送审批流程。",
  parameters: {
    type: "object",
    properties: {
      recipient: { type: "string" },
      message: { type: "string" }
    },
    required: ["recipient", "message"]
  },
  execute(args) {
    return { queued: true, recipient: args.recipient };
  }
};
