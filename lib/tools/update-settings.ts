import fs from "node:fs/promises";
import { parse, stringify } from "yaml";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

export interface UpdateSettingsArgs {
  keyPath: string;
  value: unknown;
}

export const updateSettingsTool: ToolDefinition<UpdateSettingsArgs, { updated: boolean; keyPath: string }> = {
  name: "update_settings",
  description: "运行时修改 Agent config.yaml 的指定配置项。",
  parameters: {
    type: "object",
    properties: {
      keyPath: { type: "string", description: "点分路径，例如 memory.enabled 或 tools.disabled" },
      value: { description: "新值" }
    },
    required: ["keyPath", "value"]
  },
  async execute({ keyPath, value }, context) {
    if (!context?.agentDir) {
      throw new Error("update_settings requires agentDir");
    }
    const configPath = `${context.agentDir}/config.yaml`;
    const config = parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    setByPath(config, keyPath, value);
    await fs.writeFile(configPath, stringify(config), "utf8");
    return { updated: true, keyPath };
  }
};

function setByPath(target: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("keyPath cannot be empty");
  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== "object" || current[part] === null) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1) as string] = value;
}
