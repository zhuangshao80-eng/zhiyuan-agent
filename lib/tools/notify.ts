import type { ToolDefinition } from "./types.js";

export interface NotifyArgs {
  title: string;
  message: string;
}

export const notifyTool: ToolDefinition<NotifyArgs, { delivered: boolean; title: string; message: string }> = {
  name: "notify",
  description: "发送系统通知；当前实现返回可验证通知记录，桌面适配器后续接入。",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      message: { type: "string" }
    },
    required: ["title", "message"]
  },
  execute({ title, message }) {
    return { delivered: true, title, message };
  }
};
