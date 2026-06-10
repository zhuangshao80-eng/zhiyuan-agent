import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const experienceTool: ToolDefinition<{ action: "add" | "list"; text?: string }, unknown> = {
  name: "experience",
  description: "经验沉淀工具，默认禁用；用于记录可复用的执行经验。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "list"] },
      text: { type: "string" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("experience requires agentDir");
    const file = path.join(context.agentDir, "memory", "experience.json");
    const items = await readJson<Array<{ text: string; createdAt: string }>>(file, []);
    if (args.action === "list") return items;
    if (!args.text?.trim()) throw new Error("experience.add requires text");
    items.push({ text: args.text.trim(), createdAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    return { added: true, count: items.length };
  }
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
