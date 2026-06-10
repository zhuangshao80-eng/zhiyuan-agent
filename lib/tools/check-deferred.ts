import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const checkDeferredTool: ToolDefinition<{ id?: string }, unknown> = {
  name: "check_deferred",
  description: "查询 Desk 延迟结果。",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } }
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("check_deferred requires agentDir");
    const file = path.join(context.agentDir, "desk", "deferred-results.json");
    const items = await readJson<Array<{ id: string }>>(file, []);
    return args.id ? items.find((item) => item.id === args.id) ?? null : items;
  }
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
