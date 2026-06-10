import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const channelTool: ToolDefinition<{ action: "post" | "list"; channel?: string; message?: string }, unknown> = {
  name: "channel_tool",
  description: "本地频道消息工具，将频道消息写入 Desk channels 目录。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["post", "list"] },
      channel: { type: "string" },
      message: { type: "string" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("channel_tool requires agentDir");
    const dir = path.join(context.agentDir, "desk", "channels");
    await fs.mkdir(dir, { recursive: true });
    if (args.action === "list") {
      const files = await fs.readdir(dir).catch(() => []);
      return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
    }
    const channel = safeName(args.channel ?? "general");
    const file = path.join(dir, `${channel}.json`);
    const messages = await readJson<Array<{ message: string; createdAt: string }>>(file, []);
    messages.push({ message: args.message ?? "", createdAt: new Date().toISOString() });
    await fs.writeFile(file, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
    return { channel, posted: true };
  }
};

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "general";
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
