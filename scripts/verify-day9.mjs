import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultProviderRegistry } from "../dist/core/provider-registry.js";
import { CustomProviderStore, normalizeCustomProvider } from "../dist/lib/custom-providers.js";
import { ProviderConfigStore } from "../dist/lib/provider-config.js";

const files = {
  app: await fs.readFile("desktop/renderer/src/App.tsx", "utf8"),
  settings: await fs.readFile("desktop/renderer/src/components/SettingsModal.tsx", "utf8"),
  ipc: await fs.readFile("desktop/main/ipc.ts", "utf8"),
  preload: await fs.readFile("desktop/preload/index.ts", "utf8"),
  preloadCjs: await fs.readFile("desktop/preload/index.cjs", "utf8"),
  types: await fs.readFile("shared/types.ts", "utf8"),
  css: await fs.readFile("desktop/renderer/src/styles/global.css", "utf8"),
  distHtml: await fs.readFile("dist/desktop/renderer/index.html", "utf8")
};

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day9-"));
const customProviderFile = path.join(tempRoot, "custom-providers.json");
const providerKeyFile = path.join(tempRoot, "provider-keys.json");
const customStore = new CustomProviderStore(customProviderFile);
const providerConfigStore = new ProviderConfigStore(providerKeyFile);
const customProvider = normalizeCustomProvider({
  id: "My Provider",
  name: "My Provider",
  authType: "apikey",
  compatLayer: "openai",
  baseURL: "https://api.example.com/v1",
  enabled: true
});
await customStore.save(customProvider);
const providerCreateWorked = (await customStore.list()).some((provider) => provider.id === "my_provider");
await providerConfigStore.save({ providerId: customProvider.id, apiKey: "sk-test-secret", baseURL: "https://api.changed.test/v1" });
const editedConfig = (await providerConfigStore.list()).find((config) => config.providerId === customProvider.id);
const providerEditWorked = editedConfig?.apiKeyMasked === "sk-t****cret" && editedConfig.baseURL === "https://api.changed.test/v1";
const restartedRegistry = createDefaultProviderRegistry();
for (const provider of await new CustomProviderStore(customProviderFile).list()) {
  restartedRegistry.register(provider);
}
const customProviderReloadedAfterRestart = restartedRegistry.has(customProvider.id);
await customStore.delete(customProvider.id);
await providerConfigStore.delete(customProvider.id);
const providerDeleteWorked =
  !(await customStore.list()).some((provider) => provider.id === customProvider.id) &&
  !(await providerConfigStore.list()).some((config) => config.providerId === customProvider.id);

const output = {
  settingsModalExists: files.settings.includes("export function SettingsModal"),
  tabLayout: ["Agent", "供应商", "通用"].every((text) => files.settings.includes(text)),
  agentCardStack: files.settings.includes("AgentCardStack") && files.settings.includes("calculateAgentCardGeometry"),
  cardInteractions:
    files.settings.includes("onWheel") &&
    files.settings.includes("draggable") &&
    files.settings.includes("onDrop") &&
    files.settings.includes("onSetActive") &&
    files.settings.includes("exportAgent") &&
    files.settings.includes("deleteAgent"),
  agentEditors:
    ["Agent 名称", "聊天模型", "YuanSelector", "Identity 覆盖", "Ishiki 覆盖", "MemorySection", "AgentToolsSection"].every((text) => files.settings.includes(text)),
  providersTab:
    files.settings.includes("pv-layout") &&
    files.settings.includes("ProviderDetail") &&
    files.settings.includes("AddProviderOverlay") &&
    files.settings.includes("OtherModelsSection"),
  createFlow: files.settings.includes("WelcomeScreen") && files.settings.includes("CreateAgentOverlay") && files.settings.includes("选人格"),
  generalSettings: ["紧凑模式", "减少动画", "危险操作确认"].every((text) => files.settings.includes(text)),
  ipcAgentCrud:
    ["agents:list", "agents:create", "agents:save", "agents:delete", "agents:set-active", "agents:export"].every((text) => files.ipc.includes(text)),
  ipcProvidersConfig: files.ipc.includes("providers:add-custom") && files.ipc.includes("providers:save-config") && files.ipc.includes("providers:delete"),
  sessionSearchDelete: files.app.includes("搜索会话") && files.app.includes("deleteSession") && files.ipc.includes("chat:delete-session"),
  preloadBridge:
    ["listAgents", "createAgent", "saveAgent", "deleteAgent", "setActiveAgent", "exportAgent", "addCustomProvider", "deleteProvider"].every(
      (text) => files.preload.includes(text) && files.preloadCjs.includes(text)
    ),
  sharedTypes: ["AgentSettings", "SaveAgentSettingsRequest", "CreateAgentRequest"].every((text) => files.types.includes(text)),
  appUsesModal: files.app.includes("<SettingsModal") && files.app.includes("setSettingsOpen(true)"),
  cssComponents: ["zy-input", "zy-textarea", "zy-icon-button"].every((text) => files.css.includes(text)),
  buildOutputReady: files.distHtml.includes("./assets/index-") && files.distHtml.includes(".js"),
  providerCreateWorked,
  providerEditWorked,
  providerDeleteWorked,
  customProviderReloadedAfterRestart
};

console.log(JSON.stringify(output, null, 2));
