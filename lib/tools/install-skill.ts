import { SkillManager } from "../../core/skill-manager.js";
import type { ToolDefinition } from "./types.js";

export const installSkillTool: ToolDefinition<{ name: string; source?: string }, { installed: boolean; name: string; source?: string }> = {
  name: "install_skill",
  description: "从 URL/GitHub 安装技能，写入技能目录并注册为可执行技能。",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      source: { type: "string" }
    },
    required: ["name"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("install_skill requires agentDir");
    const manager = new SkillManager(`${context.agentDir}/skills`);
    const skill = await manager.install(args.source ?? args.name, args.name);
    return { installed: true, name: skill.name, source: skill.source };
  }
};
