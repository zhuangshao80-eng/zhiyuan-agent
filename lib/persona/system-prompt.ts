import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { TOOL_DISCIPLINE_PROMPT } from "../tools/tool-discipline.js";
import { systemPromptCache } from "./prompt-cache.js";
import type { AgentConfig } from "../../shared/types.js";

export interface BuildSystemPromptOptions {
  agentDir: string;
  productDir?: string;
  userDir?: string;
  now?: Date;
  toolDisciplinePrompt?: string;
  memorySearchContext?: string;
}

export interface SystemPromptBuildResult {
  prompt: string;
  staticPrefix: string;
  dynamicTail: string;
  yuanType: string;
  sources: {
    identity: string;
    yuan: string;
    ishiki: string;
  };
}

type TemplateKind = "identity" | "yuan" | "ishiki";

const TEMPLATE_DIRS: Record<TemplateKind, string> = {
  identity: "identity-templates",
  yuan: "yuan-templates",
  ishiki: "ishiki-templates"
};

const AGENT_OVERRIDE_FILES: Record<TemplateKind, string> = {
  identity: "identity.md",
  yuan: "yuan.md",
  ishiki: "ishiki.md"
};

export async function buildSystemPrompt(options: BuildSystemPromptOptions): Promise<SystemPromptBuildResult> {
  const config = await loadAgentConfig(options.agentDir);
  const variables = {
    userName: config.user.name,
    agentName: config.agent.name,
    agentId: path.basename(options.agentDir)
  };
  const yuanType = config.agent.yuan || "zhiyuan";
  const [identity, yuan, ishiki, pinnedMemory, memoryContent] = await Promise.all([
    loadPersonaTemplate("identity", yuanType, options.agentDir, variables),
    loadPersonaTemplate("yuan", yuanType, options.agentDir, variables),
    loadPersonaTemplate("ishiki", yuanType, options.agentDir, variables),
    readOptional(path.join(options.agentDir, "memory", "pinned.md")),
    readOptional(path.join(options.agentDir, "memory", "memory.md"))
  ]);

  const staticPrefix = systemPromptCache.getOrSet(
    JSON.stringify({
      productDir: options.productDir ?? process.cwd(),
      toolDisciplinePrompt: options.toolDisciplinePrompt ?? TOOL_DISCIPLINE_PROMPT
    }),
    () =>
      renderSections("静态区（cache友好）", [
        ["平台声明", "智元Agent 是中文原生的桌面端 AI Agent 平台。你在本地应用中为用户提供协作能力。"],
        ["执行环境", renderExecutionEnvironment(options)],
        ["行为指南", "使用中文优先；先澄清目标，再采取行动；说明重要假设；输出可执行、可验证的结果。"],
        ["工具纪律", options.toolDisciplinePrompt ?? TOOL_DISCIPLINE_PROMPT],
        ["安全规则", "尊重用户数据边界；不要泄露密钥；危险操作必须谨慎；工具失败时透明报告错误。"],
        ["技能声明", "你可以进行对话、模型调用、记忆检索、工具调用、文件处理、任务管理、网页检索和本地配置更新。"]
      ])
  ).value;

  const memoryRules = config.memory.enabled
    ? "记忆系统已启用。优先使用相关历史事实，但不要编造未提供的信息。"
    : "记忆系统已关闭。不要主动注入或维护跨会话记忆。";

  const dynamicTail = renderSections("动态区", [
    ["用户档案", `用户名称：${config.user.name}\n语言环境：${config.locale}`],
    ["identity", identity.content],
    ["yuan", yuan.content],
    ["ishiki", ishiki.content],
    ["工作台", `自动批准计划任务：${config.desk.cron_auto_approve ? "开启" : "关闭"}`],
    ["工作区说明", `Agent目录：${options.agentDir}\n产品目录：${options.productDir ?? process.cwd()}\n用户目录：${options.userDir ?? ""}`.trim()],
    ["记忆规则", memoryRules],
    ["置顶记忆", pinnedMemory?.trim() || "无置顶记忆。"],
    ["记忆内容", [memoryContent?.trim(), options.memorySearchContext?.trim()].filter(Boolean).join("\n\n") || "暂无可用记忆。"],
    ["当前时间", (options.now ?? new Date()).toISOString()]
  ]);

  return {
    prompt: `${staticPrefix}\n\n${dynamicTail}`,
    staticPrefix,
    dynamicTail,
    yuanType,
    sources: {
      identity: identity.source,
      yuan: yuan.source,
      ishiki: ishiki.source
    }
  };
}

export async function updateAgentConfig(agentDir: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
  const configPath = path.join(agentDir, "config.yaml");
  const current = await loadAgentConfig(agentDir);
  const next = mergeConfig(current, patch);
  await fs.writeFile(configPath, stringify(next), "utf8");
  return next;
}

async function loadAgentConfig(agentDir: string): Promise<AgentConfig> {
  const parsed = parse(await fs.readFile(path.join(agentDir, "config.yaml"), "utf8")) as Partial<AgentConfig>;
  return normalizeConfig(parsed);
}

async function loadPersonaTemplate(
  kind: TemplateKind,
  yuanType: string,
  agentDir: string,
  variables: Record<string, string>
): Promise<{ content: string; source: string }> {
  const roots = personaRoots();
  const candidates = [
    path.join(agentDir, AGENT_OVERRIDE_FILES[kind]),
    ...roots.map((root) => path.join(root, TEMPLATE_DIRS[kind], `${yuanType}.md`)),
    ...roots.map((root) => path.join(root, TEMPLATE_DIRS[kind], "default.md"))
  ];

  for (const candidate of candidates) {
    const raw = await readOptional(candidate);
    if (raw?.trim()) {
      return { content: replaceTemplateVariables(raw, variables).trim(), source: candidate };
    }
  }

  throw new Error(`Missing persona template for ${kind}:${yuanType}`);
}

export function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(userName|agentName|agentId)\}\}/g, (_, key: string) => variables[key] ?? "");
}

function personaRoots(): string[] {
  const moduleRoot = fileURLToPath(new URL(".", import.meta.url));
  return [...new Set([moduleRoot, path.resolve(process.cwd(), "lib", "persona")])];
}

function renderSections(title: string, sections: Array<[string, string]>): string {
  return [`# ${title}`, ...sections.map(([name, content]) => `## ${name}\n${content.trim()}`)].join("\n\n");
}

function renderExecutionEnvironment(options: BuildSystemPromptOptions): string {
  return [
    "运行环境：Electron 桌面端。",
    `Agent目录：${options.agentDir}`,
    options.productDir ? `产品目录：${options.productDir}` : "",
    options.userDir ? `用户目录：${options.userDir}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function normalizeConfig(config: Partial<AgentConfig>): AgentConfig {
  return {
    agent: {
      name: config.agent?.name ?? "智元",
      yuan: config.agent?.yuan ?? "zhiyuan"
    },
    user: {
      name: config.user?.name ?? "用户"
    },
    locale: config.locale ?? "zh-CN",
    models: {
      chat: config.models?.chat ?? "deepseek:deepseek-chat",
      utility: config.models?.utility ?? "deepseek:deepseek-chat",
      utility_large: config.models?.utility_large ?? "deepseek:deepseek-chat"
    },
    memory: {
      enabled: config.memory?.enabled ?? true
    },
    tools: {
      disabled: config.tools?.disabled ?? []
    },
    desk: {
      cron_auto_approve: config.desk?.cron_auto_approve ?? true
    }
  };
}

function mergeConfig(current: AgentConfig, patch: Partial<AgentConfig>): AgentConfig {
  return normalizeConfig({
    ...current,
    ...patch,
    agent: { ...current.agent, ...patch.agent },
    user: { ...current.user, ...patch.user },
    models: { ...current.models, ...patch.models },
    memory: { ...current.memory, ...patch.memory },
    tools: { ...current.tools, ...patch.tools },
    desk: { ...current.desk, ...patch.desk }
  });
}
