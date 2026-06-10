const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zhiyuan", {
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
    const listener = (_event, streamEvent) => callback(streamEvent);
    ipcRenderer.on("chat:stream-event", listener);
    return () => ipcRenderer.off("chat:stream-event", listener);
  },
  onToolCall: (callback) => {
    const listener = (_event, streamEvent) => {
      if (streamEvent.type === "tool_call") {
        callback(streamEvent);
      }
    };
    ipcRenderer.on("chat:stream-event", listener);
    return () => ipcRenderer.off("chat:stream-event", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.off("updates:status", listener);
  }
});
