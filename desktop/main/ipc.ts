import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { Engine } from "../../core/engine.js";
import { SessionCoordinator } from "../../core/session-coordinator.js";
import { CustomProviderStore, normalizeCustomProvider } from "../../lib/custom-providers.js";
import { ChannelManager } from "../../lib/channels/channel-manager.js";
import { BridgeSessionManager } from "../../lib/bridge/session-manager.js";
import { DeskManager } from "../../lib/desk/desk-manager.js";
import { CronStore } from "../../lib/desk/cron-store.js";
import { GeneralSettingsStore } from "../../lib/settings/general-settings.js";
import { AuditLog } from "../../core/security/audit-log.js";
import { UsageLedger } from "../../core/usage-ledger.js";
import { listDefaultModelOptions } from "../../lib/models.js";
import { ProviderConfigStore } from "../../lib/provider-config.js";
import { defaultProviders } from "../../core/provider-registry.js";
import { APP_NAME, type AppMetadata, type SystemSnapshot } from "../../shared/app.js";
import type { AutoUpdateService } from "./auto-updater.js";
import type {
  AgentSettings,
  AgentToolSnapshot,
  Channel,
  ChannelMessage,
  CreateAgentRequest,
  DeskFileNode,
  ProviderDescriptor,
  ProviderKeyConfig,
  SaveAgentSettingsRequest,
  SendChatMessageRequest
} from "../../shared/types.js";

export function registerIpcHandlers(autoUpdateService?: AutoUpdateService): void {
  const sessionCoordinator = new SessionCoordinator();
  const providerConfigStore = new ProviderConfigStore();
  const customProviderStore = new CustomProviderStore();
  const defaultAgentDir = path.join(process.cwd(), "agents", "default");
  const channelManager = new ChannelManager(defaultAgentDir);
  const deskManager = new DeskManager(defaultAgentDir);
  const cronStore = new CronStore(defaultAgentDir);
  const bridgeSessionManager = new BridgeSessionManager();
  const generalSettingsStore = new GeneralSettingsStore();
  const auditLog = new AuditLog(path.join(defaultAgentDir, "security", "audit-log.jsonl"));
  const usageLedger = new UsageLedger(path.join(defaultAgentDir, "usage-ledger.jsonl"));
  const audit = (action: string, resource: string | undefined, outcome: "allowed" | "denied" | "info" = "allowed", detail?: string) =>
    auditLog.record({ action, subject: "user", resource, outcome, detail });

  ipcMain.handle("app:get-metadata", (): AppMetadata => {
    return {
      name: APP_NAME,
      version: process.env.npm_package_version ?? "0.1.0"
    };
  });

  ipcMain.handle("system:get-snapshot", (): SystemSnapshot => {
    return {
      platform: process.platform,
      versions: process.versions
    };
  });

  ipcMain.handle("engine:get-status", () => {
    return Engine.getInstance().getStatus();
  });

  ipcMain.handle("updates:get-status", () => autoUpdateService?.getStatus() ?? { type: "idle", message: "updater-unavailable" });
  ipcMain.handle("updates:check", () => autoUpdateService?.check() ?? { type: "idle", message: "updater-unavailable" });
  ipcMain.handle("updates:download", () => autoUpdateService?.download() ?? { type: "idle", message: "updater-unavailable" });
  ipcMain.handle("updates:install", () => {
    autoUpdateService?.install();
    return { installing: Boolean(autoUpdateService) };
  });

  ipcMain.handle("settings:get-general", () => generalSettingsStore.get());
  ipcMain.handle("settings:save-general", async (_event, patch: Record<string, unknown>) => {
    const saved = await generalSettingsStore.save(patch);
    await audit("settings.save", "general", "allowed", Object.keys(patch).join(","));
    return saved;
  });
  ipcMain.handle("security:audit-list", (_event, limit?: number) => auditLog.list(limit));
  ipcMain.handle("usage:summary", () => usageLedger.summary());

  ipcMain.handle("models:list", () => {
    return listDefaultModelOptions();
  });

  ipcMain.handle("providers:list", async () => {
    await loadCustomProviders(customProviderStore);
    return Engine.getInstance().providerRegistry.list();
  });

  ipcMain.handle("providers:add-custom", async (_event, provider: ProviderDescriptor) => {
    const normalized = normalizeCustomProvider(provider);
    Engine.getInstance().providerRegistry.register(normalized);
    await customProviderStore.save(normalized);
    await audit("provider.add", normalized.id);
    return Engine.getInstance().providerRegistry.list();
  });

  ipcMain.handle("providers:delete", async (_event, providerId: string) => {
    if (defaultProviders.some((provider) => provider.id === providerId)) {
      await audit("provider.delete", providerId, "denied", "built-in provider");
      throw new Error(`内置供应商不可删除：${providerId}`);
    }
    Engine.getInstance().providerRegistry.unregister(providerId);
    await customProviderStore.delete(providerId);
    await providerConfigStore.delete(providerId);
    await audit("provider.delete", providerId);
    return Engine.getInstance().providerRegistry.list();
  });

  ipcMain.handle("providers:list-config", () => {
    return providerConfigStore.list();
  });

  ipcMain.handle("providers:save-config", async (_event, config: ProviderKeyConfig) => {
    await providerConfigStore.save(config);
    await audit("provider.save-config", config.providerId, "allowed", config.apiKey ? "apiKey updated" : "baseURL updated");
    return providerConfigStore.list();
  });

  ipcMain.handle("chat:list-sessions", () => {
    return sessionCoordinator.listSessions();
  });

  ipcMain.handle("chat:get-session", (_event, sessionId: string) => {
    return sessionCoordinator.getSession(sessionId);
  });

  ipcMain.handle("chat:create-session", (_event, model: string) => {
    return sessionCoordinator.create(model);
  });

  ipcMain.handle("chat:clear-session", async (_event, sessionId: string) => {
    const result = await sessionCoordinator.clear(sessionId);
    await audit("session.clear", sessionId);
    return result;
  });

  ipcMain.handle("chat:delete-session", async (_event, sessionId: string) => {
    await sessionCoordinator.destroy(sessionId);
    await audit("session.delete", sessionId);
  });

  ipcMain.handle("chat:rename-session", async (_event, sessionId: string, title: string) => {
    const result = await sessionCoordinator.rename(sessionId, title);
    await audit("session.rename", sessionId);
    return result;
  });

  ipcMain.handle("chat:export-session", async (_event, sessionId: string) => {
    const result = await sessionCoordinator.export(sessionId);
    await audit("session.export", sessionId, "allowed", result.path);
    return result;
  });

  ipcMain.handle("chat:send-message", async (event, request: SendChatMessageRequest) => {
    return sessionCoordinator.sendMessage(request, (streamEvent) => {
      event.sender.send("chat:stream-event", streamEvent);
    });
  });

  ipcMain.handle("agents:list", () => listAgentSettings());
  ipcMain.handle("agents:create", (_event, request: CreateAgentRequest) => createAgentSettings(request));
  ipcMain.handle("agents:save", (_event, request: SaveAgentSettingsRequest) => saveAgentSettings(request));
  ipcMain.handle("agents:delete", (_event, id: string) => deleteAgentSettings(id));
  ipcMain.handle("agents:set-active", async (_event, id: string) => {
    await fs.mkdir(path.join(process.cwd(), "user-data"), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), "user-data", "active-agent.json"), `${JSON.stringify({ id }, null, 2)}\n`, "utf8");
    return listAgentSettings();
  });
  ipcMain.handle("agents:export", (_event, id: string) => exportAgentSettings(id));

  ipcMain.handle("channels:list", (): Promise<Channel[]> => channelManager.listChannels());
  ipcMain.handle("channels:create", async (_event, input: { name: string; topic?: string; dm?: boolean }) => {
    const channel = await channelManager.createChannel(input);
    await audit(input.dm ? "dm.create" : "channel.create", channel.id);
    return channel;
  });
  ipcMain.handle("channels:delete", async (_event, channelId: string) => {
    const result = await channelManager.deleteChannel(channelId);
    await audit("channel.delete", channelId);
    return result;
  });
  ipcMain.handle("channels:messages", (_event, channelId: string): Promise<ChannelMessage[]> => channelManager.listMessages(channelId));
  ipcMain.handle("channels:post", async (_event, channelId: string, content: string) => {
    const message = await channelManager.postMessage(channelId, content);
    await audit("channel.post", channelId, "allowed", `length=${content.length}`);
    return message;
  });

  ipcMain.handle("desk:tree", async (): Promise<DeskFileNode[]> => {
    const paths = await deskManager.ensure();
    return readDeskTree(paths.deskDir);
  });
  ipcMain.handle("desk:read", async (_event, filePath: string) => fs.readFile(resolveDeskPath((await deskManager.ensure()).deskDir, filePath), "utf8"));
  ipcMain.handle("desk:write", async (_event, filePath: string, content: string) => {
    const full = resolveDeskPath((await deskManager.ensure()).deskDir, filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
    await audit("desk.write", filePath, "allowed", `bytes=${content.length}`);
    return readDeskTree((await deskManager.ensure()).deskDir);
  });
  ipcMain.handle("desk:delete", async (_event, filePath: string) => {
    await fs.rm(resolveDeskPath((await deskManager.ensure()).deskDir, filePath), { recursive: true, force: true });
    await audit("desk.delete", filePath);
    return readDeskTree((await deskManager.ensure()).deskDir);
  });
  ipcMain.handle("cron:list", () => cronStore.list());
  ipcMain.handle("cron:upsert", async (_event, input: { id?: string; name: string; schedule: string; task: string; enabled?: boolean }) => {
    const job = await cronStore.upsert(input);
    await audit("cron.upsert", job.id, "allowed", job.schedule);
    return job;
  });
  ipcMain.handle("cron:delete", async (_event, id: string) => {
    const result = await cronStore.remove(id);
    await audit("cron.delete", id);
    return result;
  });
  ipcMain.handle("cron:toggle", async (_event, id: string, enabled: boolean) => {
    const result = await cronStore.setEnabled(id, enabled);
    await audit("cron.toggle", id, "allowed", String(enabled));
    return result;
  });

  ipcMain.handle("plugins:list", () => Engine.getInstance().pluginManager.list());
  ipcMain.handle("plugins:market", () => Engine.getInstance().pluginManager.listMarket());
  ipcMain.handle("plugins:install", async (_event, pluginId: string) => {
    const result = await Engine.getInstance().pluginManager.installFromMarket(pluginId);
    await audit("plugin.install", pluginId);
    return result;
  });
  ipcMain.handle("plugins:load", async (_event, pluginId: string) => {
    const result = await Engine.getInstance().pluginManager.load(pluginId);
    await audit("plugin.load", pluginId);
    return result;
  });
  ipcMain.handle("plugins:unload", async (_event, pluginId: string) => {
    const result = await Engine.getInstance().pluginManager.unload(pluginId);
    await audit("plugin.unload", pluginId);
    return result;
  });
  ipcMain.handle("plugins:post-message", async (_event, pluginId: string, payload: unknown) => {
    const result = Engine.getInstance().pluginManager.postMessage(pluginId, payload);
    await audit("plugin.post-message", pluginId);
    return result;
  });
  ipcMain.handle("plugins:host-document", (_event, pluginId: string) => Engine.getInstance().pluginManager.getHostDocument(pluginId));

  ipcMain.handle("skills:list", () => Engine.getInstance().skillManager.list());
  ipcMain.handle("skills:install", async (_event, source: string, name?: string) => {
    const result = await Engine.getInstance().skillManager.install(source, name);
    await audit("skill.install", result.name, "allowed", source);
    return result;
  });
  ipcMain.handle("skills:execute", async (_event, name: string, input: string) => {
    const result = Engine.getInstance().skillManager.execute(name, input);
    await audit("skill.execute", name);
    return result;
  });

  ipcMain.handle("bridge:adapters", () => bridgeSessionManager.listAdapters());
  ipcMain.handle("bridge:create-session", async (_event, adapterId: string, conversationId: string) => {
    const result = bridgeSessionManager.createSession(adapterId, conversationId);
    await audit("bridge.create-session", result.id);
    return result;
  });
  ipcMain.handle("bridge:send", async (_event, sessionId: string, content: string) => {
    const result = await bridgeSessionManager.send(sessionId, content);
    await audit("bridge.send", sessionId, result.transport?.ok === false ? "denied" : "allowed", result.transport?.mode);
    return result;
  });
  ipcMain.handle("bridge:sessions", () => bridgeSessionManager.listSessions());
}

async function listAgentSettings(): Promise<AgentSettings[]> {
  const agentsDir = path.join(process.cwd(), "agents");
  await fs.mkdir(agentsDir, { recursive: true });
  const activeId = await readActiveAgentId();
  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const agents = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => readAgentSettings(entry.name, entry.name === activeId || (!activeId && entry.name === "default")))
  );
  return agents.filter((agent): agent is AgentSettings => Boolean(agent));
}

async function readAgentSettings(id: string, isActive: boolean): Promise<AgentSettings | null> {
  const agentDir = path.join(process.cwd(), "agents", id);
  try {
    const config = normalizeAgentConfig(parse(await fs.readFile(path.join(agentDir, "config.yaml"), "utf8")) as Record<string, any>);
    const engine = Engine.getInstance();
    const agent = engine.agentManager.getAgent(id);
    const tools: AgentToolSnapshot[] =
      agent?.getToolsSnapshot().map((tool) => ({ name: tool.name, description: tool.description, enabled: tool.enabled })) ??
      Engine.getInstance().agentManager.getActiveAgent()?.getToolsSnapshot().map((tool) => ({ name: tool.name, description: tool.description, enabled: !config.tools.disabled.includes(tool.name) })) ??
      [];
    return {
      id,
      name: config.agent.name,
      yuan: config.agent.yuan,
      userName: config.user.name,
      chatModel: config.models.chat,
      utilityModel: config.models.utility,
      utilityLargeModel: config.models.utility_large,
      memoryEnabled: config.memory.enabled,
      sessionMemoryEnabled: true,
      toolsDisabled: config.tools.disabled,
      identityText: await readOptional(path.join(agentDir, "identity.md")),
      ishikiText: await readOptional(path.join(agentDir, "ishiki.md")),
      isActive,
      tools
    };
  } catch {
    return null;
  }
}

async function createAgentSettings(request: CreateAgentRequest): Promise<AgentSettings[]> {
  const id = (request.id || request.name).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_") || `agent_${Date.now()}`;
  const agentDir = path.join(process.cwd(), "agents", id);
  await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });
  await fs.mkdir(path.join(agentDir, "sessions"), { recursive: true });
  await fs.mkdir(path.join(agentDir, "desk"), { recursive: true });
  await fs.writeFile(path.join(agentDir, "config.yaml"), stringify(normalizeAgentConfig({
    agent: { name: request.name, yuan: request.yuan },
    user: { name: "用户" },
    models: { chat: request.chatModel, utility: request.chatModel, utility_large: request.chatModel }
  })), "utf8");
  await fs.writeFile(path.join(agentDir, "identity.md"), "", "utf8");
  await fs.writeFile(path.join(agentDir, "ishiki.md"), "", "utf8");
  await fs.mkdir(path.join(process.cwd(), "user-data"), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "user-data", "active-agent.json"), `${JSON.stringify({ id }, null, 2)}\n`, "utf8");
  return listAgentSettings();
}

async function saveAgentSettings(request: SaveAgentSettingsRequest): Promise<AgentSettings[]> {
  const agentDir = path.join(process.cwd(), "agents", request.id);
  const configPath = path.join(agentDir, "config.yaml");
  const current = normalizeAgentConfig(parse(await fs.readFile(configPath, "utf8")) as Record<string, any>);
  const next = normalizeAgentConfig({
    ...current,
    agent: { ...current.agent, name: request.name ?? current.agent.name, yuan: request.yuan ?? current.agent.yuan },
    user: { ...current.user, name: request.userName ?? current.user.name },
    models: {
      ...current.models,
      chat: request.chatModel ?? current.models.chat,
      utility: request.utilityModel ?? current.models.utility,
      utility_large: request.utilityLargeModel ?? current.models.utility_large
    },
    memory: { enabled: request.memoryEnabled ?? current.memory.enabled },
    tools: { disabled: request.toolsDisabled ?? current.tools.disabled }
  });
  await fs.writeFile(configPath, stringify(next), "utf8");
  if (request.identityText !== undefined) await fs.writeFile(path.join(agentDir, "identity.md"), request.identityText, "utf8");
  if (request.ishikiText !== undefined) await fs.writeFile(path.join(agentDir, "ishiki.md"), request.ishikiText, "utf8");
  return listAgentSettings();
}

async function deleteAgentSettings(id: string): Promise<AgentSettings[]> {
  if (id !== "default") {
    await fs.rm(path.join(process.cwd(), "agents", id), { recursive: true, force: true });
  }
  return listAgentSettings();
}

async function exportAgentSettings(id: string): Promise<{ id: string; path: string }> {
  const agents = await listAgentSettings();
  const agent = agents.find((item) => item.id === id);
  if (!agent) throw new Error(`Agent not found: ${id}`);
  const filePath = path.join(process.cwd(), "artifacts", `${id}-agent-export.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(agent, null, 2)}\n`, "utf8");
  return { id, path: filePath };
}

async function readActiveAgentId(): Promise<string | undefined> {
  try {
    return (JSON.parse(await fs.readFile(path.join(process.cwd(), "user-data", "active-agent.json"), "utf8")) as { id?: string }).id;
  } catch {
    return undefined;
  }
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalizeAgentConfig(config: Record<string, any>) {
  return {
    agent: { name: config.agent?.name ?? "智元", yuan: config.agent?.yuan ?? "zhiyuan" },
    user: { name: config.user?.name ?? "用户" },
    locale: config.locale ?? "zh-CN",
    models: {
      chat: config.models?.chat ?? "deepseek:deepseek-chat",
      utility: config.models?.utility ?? config.models?.chat ?? "deepseek:deepseek-chat",
      utility_large: config.models?.utility_large ?? config.models?.chat ?? "deepseek:deepseek-chat"
    },
    memory: { enabled: config.memory?.enabled ?? true },
    tools: { disabled: config.tools?.disabled ?? [] },
    desk: { cron_auto_approve: config.desk?.cron_auto_approve ?? true }
  };
}

async function loadCustomProviders(store: CustomProviderStore): Promise<void> {
  for (const provider of await store.list()) {
    Engine.getInstance().providerRegistry.register(provider);
  }
}

async function readDeskTree(root: string, dir = root): Promise<DeskFileNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nodes = await Promise.all(
    entries
      .filter((entry) => entry.name !== "cron-runs")
      .map(async (entry) => {
        const full = path.join(dir, entry.name);
        const relative = path.relative(root, full);
        return {
          name: entry.name,
          path: relative,
          type: entry.isDirectory() ? "directory" : "file",
          children: entry.isDirectory() ? await readDeskTree(root, full) : undefined
        } satisfies DeskFileNode;
      })
  );
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-CN") : a.type === "directory" ? -1 : 1));
}

function resolveDeskPath(root: string, filePath: string): string {
  const full = path.resolve(root, filePath);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Desk path escapes workspace");
  }
  return full;
}
