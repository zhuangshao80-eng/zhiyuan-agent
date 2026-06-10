import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const sessionFoldersTool: ToolDefinition<{ action: "create" | "list" | "assign"; folder?: string; sessionId?: string }, unknown> = {
  name: "session_folders",
  description: "管理会话文件夹和会话归档关系。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "list", "assign"] },
      folder: { type: "string" },
      sessionId: { type: "string" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("session_folders requires agentDir");
    const file = path.join(context.agentDir, "desk", "session-folders.json");
    const folders = await readJson<Record<string, string[]>>(file, {});
    if (args.action === "list") return folders;
    const folder = args.folder ?? "default";
    folders[folder] = folders[folder] ?? [];
    if (args.action === "assign" && args.sessionId && !folders[folder].includes(args.sessionId)) folders[folder].push(args.sessionId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(folders, null, 2)}\n`, "utf8");
    return { folder, sessions: folders[folder] };
  }
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
