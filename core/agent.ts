import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { FactStore } from "../lib/memory/fact-store.js";
import { createMemorySearchTool, type MemorySearchTool } from "../lib/memory/memory-search.js";
import { MemoryTicker } from "../lib/memory/memory-ticker.js";
import { buildSystemPrompt, updateAgentConfig } from "../lib/persona/system-prompt.js";
import { createCoreToolRegistry, DEFAULT_DISABLED_TOOLS } from "../lib/tools/core-tools.js";
import { createPinnedMemoryTools, type PinnedMemoryTools } from "../lib/tools/pinned-memory.js";
import { TOOL_DISCIPLINE_PROMPT } from "../lib/tools/tool-discipline.js";
import type { ToolRegistry } from "../lib/tools/tool-registry.js";
import type { ToolDefinition, ToolSnapshotItem } from "../lib/tools/types.js";
import type {
  AgentCallbacks,
  AgentConfig,
  AgentConstructorOptions,
  AgentIdentity,
  AgentInitState,
  AgentPaths,
  AgentStatus
} from "../shared/types.js";

export class Agent {
  readonly id: string;
  readonly agentsDir: string;
  readonly productDir: string;
  readonly userDir: string;
  readonly paths: AgentPaths;
  readonly _cb: AgentCallbacks;

  status: AgentStatus = "idle";
  config: AgentConfig | null = null;
  identity: AgentIdentity | null = null;
  factStore: FactStore | null = null;
  memoryTicker: MemoryTicker | null = null;
  memorySearchTool: MemorySearchTool | null = null;
  pinnedMemoryTools: PinnedMemoryTools | null = null;
  toolRegistry: ToolRegistry | null = null;
  toolDisciplinePrompt = TOOL_DISCIPLINE_PROMPT;
  initState: AgentInitState = {
    configLoaded: false,
    identityLoaded: false,
    memoryReady: false,
    toolsReady: false,
    promptReady: false
  };

  constructor({ id, agentsDir, productDir, userDir, cb = {} }: AgentConstructorOptions) {
    this.id = id;
    this.agentsDir = agentsDir;
    this.productDir = productDir;
    this.userDir = userDir;
    this._cb = cb;
    this.paths = Agent.derivePaths(id, agentsDir);
  }

  static derivePaths(id: string, agentsDir: string): AgentPaths {
    const agentDir = path.join(agentsDir, id);

    return {
      agentDir,
      configPath: path.join(agentDir, "config.yaml"),
      identityPath: path.join(agentDir, "identity.md"),
      ishikiPath: path.join(agentDir, "ishiki.md"),
      memoryDir: path.join(agentDir, "memory"),
      sessionDir: path.join(agentDir, "sessions"),
      deskDir: path.join(agentDir, "desk")
    };
  }

  async loadConfig(): Promise<AgentConfig> {
    const rawConfig = await fs.readFile(this.paths.configPath, "utf8");
    const parsed = parse(rawConfig) as Partial<AgentConfig> | null;

    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Agent config is empty or invalid: ${this.paths.configPath}`);
    }

    const config = normalizeConfig(parsed);
    this.config = config;
    this.initState.configLoaded = true;
    return config;
  }

  async init(): Promise<void> {
    if (this.status === "ready") {
      return;
    }

    this.status = "initializing";
    this.emit("agent:init:start");

    const config = await this.loadConfig();
    const [identityText, ishikiText] = await Promise.all([
      readOptionalFile(this.paths.identityPath),
      readOptionalFile(this.paths.ishikiPath)
    ]);

    this.identity = {
      id: this.id,
      name: config.agent.name,
      yuan: config.agent.yuan,
      identityText: identityText ?? "",
      ishikiText: ishikiText ?? ""
    };
    this.initState.identityLoaded = true;

    await Promise.all([
      fs.mkdir(this.paths.memoryDir, { recursive: true }),
      fs.mkdir(this.paths.sessionDir, { recursive: true }),
      fs.mkdir(this.paths.deskDir, { recursive: true })
    ]);

    this.initState.memoryReady = true;
    this.factStore = new FactStore(path.join(this.paths.memoryDir, "facts.db"));
    this.memorySearchTool = createMemorySearchTool(this.factStore);
    this.pinnedMemoryTools = createPinnedMemoryTools(this.paths.agentDir);
    this.toolRegistry = createCoreToolRegistry(config.tools.disabled);
    this.toolRegistry.register(toToolDefinition(this.memorySearchTool.definition, (args) =>
      this.memorySearchTool?.execute(args as { keyword?: string; tags?: string[]; limit?: number })
    ));
    this.toolRegistry.register(toToolDefinition(this.pinnedMemoryTools.read.definition, () => this.pinnedMemoryTools?.read.execute()));
    this.toolRegistry.register(toToolDefinition(this.pinnedMemoryTools.write.definition, (args) =>
      this.pinnedMemoryTools?.write.execute(args as { content: string; mode?: "append" | "replace" })
    ));
    this.memoryTicker = new MemoryTicker({
      memoryDir: this.paths.memoryDir,
      masterEnabled: config.memory.enabled,
      sessionEnabled: true
    });
    if (config.memory.enabled) {
      this.memoryTicker.start();
    }
    this.initState.toolsReady = true;
    this.initState.promptReady = true;
    this.status = "ready";
    this.emit("agent:init:ready");
  }

  async dispose(): Promise<void> {
    if (this.status === "disposed") {
      return;
    }

    this.status = "disposed";
    this.memoryTicker?.stop();
    this.memoryTicker = null;
    this.factStore?.close();
    this.factStore = null;
    this.memorySearchTool = null;
    this.pinnedMemoryTools = null;
    this.toolRegistry = null;
    this.emit("agent:dispose");
  }

  get agentDir(): string {
    return this.paths.agentDir;
  }

  get configPath(): string {
    return this.paths.configPath;
  }

  getToolsSnapshot(): ToolSnapshotItem[] {
    if (!this.toolRegistry) {
      const disabled = this.config?.tools.disabled ?? [];
      return createCoreToolRegistry(disabled).snapshot();
    }

    this.toolRegistry.setDisabled([...DEFAULT_DISABLED_TOOLS, ...(this.config?.tools.disabled ?? [])]);
    return this.toolRegistry.snapshot();
  }

  getToolDisciplinePrompt(): string {
    return this.toolDisciplinePrompt;
  }

  async buildSystemPrompt(): Promise<string> {
    const result = await buildSystemPrompt({
      agentDir: this.paths.agentDir,
      productDir: this.productDir,
      userDir: this.userDir,
      toolDisciplinePrompt: this.toolDisciplinePrompt
    });
    return result.prompt;
  }

  async updateConfig(patch: Partial<AgentConfig>): Promise<AgentConfig> {
    const next = await updateAgentConfig(this.paths.agentDir, patch);
    this.config = next;
    if (this.identity) {
      this.identity = {
        ...this.identity,
        name: next.agent.name,
        yuan: next.agent.yuan
      };
    }
    this.toolRegistry?.setDisabled([...DEFAULT_DISABLED_TOOLS, ...next.tools.disabled]);
    return next;
  }

  private emit(type: string): void {
    this._cb.emitEvent?.({
      type,
      timestamp: new Date().toISOString(),
      payload: { agentId: this.id }
    });
  }
}

export async function loadConfig(options: AgentConstructorOptions): Promise<AgentConfig> {
  const agent = new Agent(options);
  return agent.loadConfig();
}

function normalizeConfig(config: Partial<AgentConfig>): AgentConfig {
  if (!config.agent?.name || !config.agent?.yuan) {
    throw new Error("Agent config must include agent.name and agent.yuan");
  }

  return {
    agent: {
      name: config.agent.name,
      yuan: config.agent.yuan
    },
    user: {
      name: config.user?.name ?? "用户"
    },
    locale: config.locale ?? "zh-CN",
    models: {
      chat: config.models?.chat ?? "openai:gpt-4o-mini",
      utility: config.models?.utility ?? "openai:gpt-4o-mini",
      utility_large: config.models?.utility_large ?? "openai:gpt-4o"
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

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function toToolDefinition(
  llmTool: { function: { name: string; description?: string; parameters?: Record<string, unknown> } },
  execute: ToolDefinition["execute"]
): ToolDefinition {
  return {
    name: llmTool.function.name,
    description: llmTool.function.description ?? llmTool.function.name,
    parameters: llmTool.function.parameters ?? { type: "object", properties: {} },
    execute
  };
}
