import { contextBridge, ipcRenderer } from "electron";
import type { AppMetadata, SystemSnapshot } from "../../shared/app.js";
import type {
  ChatSession,
  ChatStreamEvent,
  Channel,
  ChannelMessage,
  DeskFileNode,
  EngineStatus,
  AgentSettings,
  CreateAgentRequest,
  ModelOption,
  ProviderDescriptor,
  ProviderKeyConfig,
  SaveAgentSettingsRequest,
  SendChatMessageRequest,
  SendChatMessageResult
} from "../../shared/types.js";

export interface ZhiYuanApi {
  getAppMetadata: () => Promise<AppMetadata>;
  getSystemSnapshot: () => Promise<SystemSnapshot>;
  getEngineStatus: () => Promise<EngineStatus>;
  getUpdateStatus: () => Promise<any>;
  checkForUpdates: () => Promise<any>;
  downloadUpdate: () => Promise<any>;
  installUpdate: () => Promise<any>;
  getGeneralSettings: () => Promise<any>;
  saveGeneralSettings: (patch: Record<string, unknown>) => Promise<any>;
  listAuditLog: (limit?: number) => Promise<any[]>;
  getUsageSummary: () => Promise<any>;
  listModels: () => Promise<ModelOption[]>;
  listProviders: () => Promise<ProviderDescriptor[]>;
  addCustomProvider: (provider: ProviderDescriptor) => Promise<ProviderDescriptor[]>;
  deleteProvider: (providerId: string) => Promise<ProviderDescriptor[]>;
  listProviderConfig: () => Promise<ProviderKeyConfig[]>;
  saveProviderConfig: (config: ProviderKeyConfig) => Promise<ProviderKeyConfig[]>;
  listAgents: () => Promise<AgentSettings[]>;
  createAgent: (request: CreateAgentRequest) => Promise<AgentSettings[]>;
  saveAgent: (request: SaveAgentSettingsRequest) => Promise<AgentSettings[]>;
  deleteAgent: (id: string) => Promise<AgentSettings[]>;
  setActiveAgent: (id: string) => Promise<AgentSettings[]>;
  exportAgent: (id: string) => Promise<{ id: string; path: string }>;
  listSessions: () => Promise<ChatSession[]>;
  getSession: (sessionId: string) => Promise<ChatSession | null>;
  createSession: (model: string) => Promise<ChatSession>;
  clearSession: (sessionId: string) => Promise<ChatSession | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<ChatSession | null>;
  exportSession: (sessionId: string) => Promise<{ sessionId: string; path: string }>;
  sendChatMessage: (request: SendChatMessageRequest) => Promise<SendChatMessageResult>;
  listChannels: () => Promise<Channel[]>;
  createChannel: (input: { name: string; topic?: string; dm?: boolean }) => Promise<Channel>;
  deleteChannel: (channelId: string) => Promise<{ deleted: boolean }>;
  listChannelMessages: (channelId: string) => Promise<ChannelMessage[]>;
  postChannelMessage: (channelId: string, content: string) => Promise<ChannelMessage>;
  getDeskTree: () => Promise<DeskFileNode[]>;
  readDeskFile: (filePath: string) => Promise<string>;
  writeDeskFile: (filePath: string, content: string) => Promise<DeskFileNode[]>;
  deleteDeskFile: (filePath: string) => Promise<DeskFileNode[]>;
  listCronJobs: () => Promise<any[]>;
  upsertCronJob: (input: { id?: string; name: string; schedule: string; task: string; enabled?: boolean }) => Promise<any>;
  deleteCronJob: (id: string) => Promise<{ deleted: boolean }>;
  toggleCronJob: (id: string, enabled: boolean) => Promise<any>;
  listPlugins: () => Promise<any[]>;
  listPluginMarket: () => Promise<any[]>;
  installPlugin: (pluginId: string) => Promise<any>;
  loadPlugin: (pluginId: string) => Promise<any>;
  unloadPlugin: (pluginId: string) => Promise<any>;
  postPluginMessage: (pluginId: string, payload: unknown) => Promise<any>;
  getPluginHostDocument: (pluginId: string) => Promise<any>;
  listSkills: () => Promise<any[]>;
  installSkill: (source: string, name?: string) => Promise<any>;
  executeSkill: (name: string, input: string) => Promise<any>;
  listBridgeAdapters: () => Promise<any[]>;
  createBridgeSession: (adapterId: string, conversationId: string) => Promise<any>;
  sendBridgeMessage: (sessionId: string, content: string) => Promise<any>;
  listBridgeSessions: () => Promise<any[]>;
  onStreamToken: (callback: (event: ChatStreamEvent) => void) => () => void;
  onToolCall: (callback: (event: Extract<ChatStreamEvent, { type: "tool_call" }>) => void) => () => void;
  onUpdateStatus: (callback: (event: any) => void) => () => void;
}

const api: ZhiYuanApi = {
  getAppMetadata: () => ipcRenderer.invoke("app:get-metadata"),
  getSystemSnapshot: () => ipcRenderer.invoke("system:get-snapshot"),
  getEngineStatus: () => ipcRenderer.invoke("engine:get-status"),
  getUpdateStatus: () => ipcRenderer.invoke("updates:get-status"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  getGeneralSettings: () => ipcRenderer.invoke("settings:get-general"),
  saveGeneralSettings: (patch) => ipcRenderer.invoke("settings:save-general", patch),
  listAuditLog: (limit) => ipcRenderer.invoke("security:audit-list", limit),
  getUsageSummary: () => ipcRenderer.invoke("usage:summary"),
  listModels: () => ipcRenderer.invoke("models:list"),
  listProviders: () => ipcRenderer.invoke("providers:list"),
  addCustomProvider: (provider) => ipcRenderer.invoke("providers:add-custom", provider),
  deleteProvider: (providerId) => ipcRenderer.invoke("providers:delete", providerId),
  listProviderConfig: () => ipcRenderer.invoke("providers:list-config"),
  saveProviderConfig: (config) => ipcRenderer.invoke("providers:save-config", config),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  createAgent: (request) => ipcRenderer.invoke("agents:create", request),
  saveAgent: (request) => ipcRenderer.invoke("agents:save", request),
  deleteAgent: (id) => ipcRenderer.invoke("agents:delete", id),
  setActiveAgent: (id) => ipcRenderer.invoke("agents:set-active", id),
  exportAgent: (id) => ipcRenderer.invoke("agents:export", id),
  listSessions: () => ipcRenderer.invoke("chat:list-sessions"),
  getSession: (sessionId) => ipcRenderer.invoke("chat:get-session", sessionId),
  createSession: (model) => ipcRenderer.invoke("chat:create-session", model),
  clearSession: (sessionId) => ipcRenderer.invoke("chat:clear-session", sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke("chat:delete-session", sessionId),
  renameSession: (sessionId, title) => ipcRenderer.invoke("chat:rename-session", sessionId, title),
  exportSession: (sessionId) => ipcRenderer.invoke("chat:export-session", sessionId),
  sendChatMessage: (request) => ipcRenderer.invoke("chat:send-message", request),
  listChannels: () => ipcRenderer.invoke("channels:list"),
  createChannel: (input) => ipcRenderer.invoke("channels:create", input),
  deleteChannel: (channelId) => ipcRenderer.invoke("channels:delete", channelId),
  listChannelMessages: (channelId) => ipcRenderer.invoke("channels:messages", channelId),
  postChannelMessage: (channelId, content) => ipcRenderer.invoke("channels:post", channelId, content),
  getDeskTree: () => ipcRenderer.invoke("desk:tree"),
  readDeskFile: (filePath) => ipcRenderer.invoke("desk:read", filePath),
  writeDeskFile: (filePath, content) => ipcRenderer.invoke("desk:write", filePath, content),
  deleteDeskFile: (filePath) => ipcRenderer.invoke("desk:delete", filePath),
  listCronJobs: () => ipcRenderer.invoke("cron:list"),
  upsertCronJob: (input) => ipcRenderer.invoke("cron:upsert", input),
  deleteCronJob: (id) => ipcRenderer.invoke("cron:delete", id),
  toggleCronJob: (id, enabled) => ipcRenderer.invoke("cron:toggle", id, enabled),
  listPlugins: () => ipcRenderer.invoke("plugins:list"),
  listPluginMarket: () => ipcRenderer.invoke("plugins:market"),
  installPlugin: (pluginId) => ipcRenderer.invoke("plugins:install", pluginId),
  loadPlugin: (pluginId) => ipcRenderer.invoke("plugins:load", pluginId),
  unloadPlugin: (pluginId) => ipcRenderer.invoke("plugins:unload", pluginId),
  postPluginMessage: (pluginId, payload) => ipcRenderer.invoke("plugins:post-message", pluginId, payload),
  getPluginHostDocument: (pluginId) => ipcRenderer.invoke("plugins:host-document", pluginId),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  installSkill: (source, name) => ipcRenderer.invoke("skills:install", source, name),
  executeSkill: (name, input) => ipcRenderer.invoke("skills:execute", name, input),
  listBridgeAdapters: () => ipcRenderer.invoke("bridge:adapters"),
  createBridgeSession: (adapterId, conversationId) => ipcRenderer.invoke("bridge:create-session", adapterId, conversationId),
  sendBridgeMessage: (sessionId, content) => ipcRenderer.invoke("bridge:send", sessionId, content),
  listBridgeSessions: () => ipcRenderer.invoke("bridge:sessions"),
  onStreamToken: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, streamEvent: ChatStreamEvent) => callback(streamEvent);
    ipcRenderer.on("chat:stream-event", listener);
    return () => ipcRenderer.off("chat:stream-event", listener);
  },
  onToolCall: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, streamEvent: ChatStreamEvent) => {
      if (streamEvent.type === "tool_call") {
        callback(streamEvent);
      }
    };
    ipcRenderer.on("chat:stream-event", listener);
    return () => ipcRenderer.off("chat:stream-event", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.off("updates:status", listener);
  }
};

contextBridge.exposeInMainWorld("zhiyuan", api);
