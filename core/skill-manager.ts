import fs from "node:fs/promises";
import path from "node:path";

export interface SkillDefinition {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  source?: string;
  installedAt?: string;
}

export interface SkillExecutionResult {
  name: string;
  prompt: string;
  tools: string[];
  input: string;
  output: string;
}

export class SkillManager {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(private readonly skillsDir = path.join(process.cwd(), "skills")) {
    for (const skill of builtInSkills) {
      this.skills.set(skill.name, skill);
    }
  }

  register(skill: SkillDefinition): SkillDefinition {
    const normalized = normalizeSkill(skill);
    this.skills.set(normalized.name, normalized);
    return normalized;
  }

  async install(source: string, name?: string): Promise<SkillDefinition> {
    const skill = normalizeSkill({
      name: name ?? inferSkillName(source),
      description: `从 ${source} 安装的技能`,
      prompt: `使用来自 ${source} 的技能说明执行任务。`,
      tools: [],
      source,
      installedAt: new Date().toISOString()
    });
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.writeFile(path.join(this.skillsDir, `${skill.name}.json`), `${JSON.stringify(skill, null, 2)}\n`, "utf8");
    this.skills.set(skill.name, skill);
    return skill;
  }

  async loadInstalled(): Promise<SkillDefinition[]> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    const entries = await fs.readdir(this.skillsDir).catch(() => []);
    for (const entry of entries.filter((item) => item.endsWith(".json"))) {
      const skill = JSON.parse(await fs.readFile(path.join(this.skillsDir, entry), "utf8")) as SkillDefinition;
      this.register(skill);
    }
    return this.list();
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  execute(name: string, input: string): SkillExecutionResult {
    const skill = this.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    return {
      name,
      prompt: skill.prompt,
      tools: skill.tools,
      input,
      output: `[${skill.name}] ${skill.prompt}\n任务：${input}`
    };
  }
}

export const builtInSkills: SkillDefinition[] = [
  {
    name: "code-review",
    description: "代码审查",
    prompt: "以风险、缺陷、测试缺口为优先级进行代码审查。",
    tools: ["file_ops", "terminal"]
  },
  {
    name: "document-generation",
    description: "文档生成",
    prompt: "将输入整理为结构清晰、面向中文读者的文档。",
    tools: ["file_ops"]
  },
  {
    name: "data-analysis",
    description: "数据分析",
    prompt: "分析结构化数据，输出结论、指标和可视化建议。",
    tools: ["file_ops", "terminal"]
  }
];

function normalizeSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    name: skill.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    description: skill.description.trim(),
    prompt: skill.prompt.trim(),
    tools: skill.tools ?? []
  };
}

function inferSkillName(source: string): string {
  const tail = source.split(/[/:#]/).filter(Boolean).at(-1) ?? "skill";
  return tail.replace(/\.git$/, "") || "skill";
}
