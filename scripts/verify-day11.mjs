import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BridgeSessionManager } from "../dist/lib/bridge/session-manager.js";
import { DingTalkBridgeAdapter } from "../dist/lib/bridge/dingtalk.js";
import { FeishuBridgeAdapter } from "../dist/lib/bridge/feishu.js";
import {
  createHostMessage,
  isPluginAckMessage,
  isPluginReadyMessage,
  PLUGIN_IFRAME_SANDBOX
} from "../dist/lib/plugin/plugin-host-protocol.js";
import { PluginManager } from "../dist/core/plugin-manager.js";
import { SessionCoordinator } from "../dist/core/session-coordinator.js";
import { SkillManager } from "../dist/core/skill-manager.js";
import { installSkillTool } from "../dist/lib/tools/install-skill.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day11-"));
const agentDir = path.join(root, "agents", "default");
await fs.mkdir(agentDir, { recursive: true });

const pluginManager = new PluginManager(path.join(root, "plugins"));
const plugin = await pluginManager.register({
  id: "hello-plugin",
  name: "Hello Plugin",
  version: "0.1.0",
  entry: "index.html",
  permissions: ["channels:read"]
});
const loaded = await pluginManager.load(plugin.id);
const pluginHostDocument = await pluginManager.getHostDocument(plugin.id);
const pluginMessage = pluginManager.postMessage(plugin.id, createHostMessage(plugin.id, { type: "ping" }));
const marketInstalled = await pluginManager.installFromMarket("desk-notes");
const updated = await pluginManager.update(plugin.id, { version: "0.2.0" });
await pluginManager.unload(plugin.id);
const pluginList = await pluginManager.list();

const skillManager = new SkillManager(path.join(agentDir, "skills"));
const builtIns = skillManager.list();
const installedSkill = await skillManager.install("https://github.com/example/research-skill.git", "research-skill");
const loadedSkills = await skillManager.loadInstalled();
const installedByTool = await installSkillTool.execute(
  { name: "tool-skill", source: "https://example.com/tool-skill.json" },
  { agentDir, cwd: root }
);

const coordinator = new SessionCoordinator({
  sessionsDir: path.join(agentDir, "sessions"),
  memoryDir: path.join(agentDir, "memory"),
  agentDir,
  skillManager
});
const skillEvents = [];
const sendResult = await coordinator.sendMessage(
  { model: "deepseek:deepseek-chat", content: "使用技能 research-skill 生成一份调研摘要" },
  (event) => skillEvents.push(event)
);
await waitFor(() => skillEvents.some((event) => event.type === "done"));
const skillSession = await coordinator.getSession(sendResult.sessionId);
coordinator.dispose();

const bridge = new BridgeSessionManager();
const adapters = bridge.listAdapters();
const feishuSession = bridge.createSession("feishu", "chat-a");
const dingtalkSession = bridge.createSession("dingtalk", "chat-b");
const wechatSession = bridge.createSession("wechat", "chat-c");
const feishuMessage = await bridge.send(feishuSession.id, "飞书消息");
const dingtalkMessage = await bridge.send(dingtalkSession.id, "钉钉消息");
const wechatMessage = await bridge.send(wechatSession.id, "企微消息");

const bridgeCoordinator = new SessionCoordinator({
  sessionsDir: path.join(agentDir, "bridge-sessions"),
  memoryDir: path.join(agentDir, "bridge-memory"),
  agentDir,
  skillManager
});
const feishuAgentRoute = await bridge.routeInboundToAgent({
  adapterId: "feishu",
  conversationId: "chat-agent-feishu",
  sender: "feishu-user",
  content: "使用技能 research-skill 从飞书入站消息生成回复",
  coordinator: bridgeCoordinator,
  model: "deepseek:deepseek-chat"
});
const dingtalkAgentRoute = await bridge.routeInboundToAgent({
  adapterId: "dingtalk",
  conversationId: "chat-agent-dingtalk",
  sender: "dingtalk-user",
  content: "使用技能 research-skill 从钉钉入站消息生成回复",
  coordinator: bridgeCoordinator,
  model: "deepseek:deepseek-chat"
});
bridgeCoordinator.dispose();

const feishuConfigured = new FeishuBridgeAdapter({ webhookUrl: "https://example.invalid/feishu", signingSecret: "secret" });
const dingtalkConfigured = new DingTalkBridgeAdapter({ webhookUrl: "https://example.invalid/dingtalk", signingSecret: "secret" });
const feishuInbound = feishuConfigured.parseInboundEvent({
  event: {
    message: { chat_id: "chat-real", content: JSON.stringify({ text: "入站飞书消息" }) },
    sender: { sender_id: { open_id: "ou_x" } }
  }
});
const dingtalkInbound = dingtalkConfigured.parseInboundEvent({
  conversationId: "cid-real",
  senderStaffId: "staff-x",
  text: { content: "入站钉钉消息" }
});

const realFeishu = await verifyRealFeishuIfConfigured();
const realDingTalk = await verifyRealDingTalkIfConfigured();

const files = {
  pluginManager: await fs.readFile("core/plugin-manager.ts", "utf8"),
  pluginHost: await fs.readFile("desktop/renderer/src/components/PluginHost.tsx", "utf8"),
  skillManager: await fs.readFile("core/skill-manager.ts", "utf8"),
  sessionCoordinator: await fs.readFile("core/session-coordinator.ts", "utf8"),
  bridgeBase: await fs.readFile("lib/bridge/bridge-base.ts", "utf8"),
  feishu: await fs.readFile("lib/bridge/feishu.ts", "utf8"),
  dingtalk: await fs.readFile("lib/bridge/dingtalk.ts", "utf8"),
  wechat: await fs.readFile("lib/bridge/wechat.ts", "utf8"),
  ipc: await fs.readFile("desktop/main/ipc.ts", "utf8"),
  preload: await fs.readFile("desktop/preload/index.ts", "utf8")
};

const skillToolEvents = skillEvents.filter((event) => event.type === "tool_call");
const skillAssistant = skillSession?.messages.find((message) => message.role === "assistant");
const output = {
  pluginRegistered: plugin.id === "hello-plugin" && (await exists(path.join(root, "plugins", "hello-plugin", "plugin.json"))),
  pluginSandboxIframe: loaded.sandbox.type === "iframe" && loaded.sandbox.sandbox === PLUGIN_IFRAME_SANDBOX,
  pluginIframeRendered:
    files.pluginHost.includes("<iframe") &&
    files.pluginHost.includes("sandbox={PLUGIN_IFRAME_SANDBOX}") &&
    files.pluginHost.includes("srcDoc={srcDoc}"),
  pluginReadyMessageReceived:
    isPluginReadyMessage({ type: "plugin:ready", pluginId: plugin.id }, plugin.id) &&
    pluginHostDocument.srcDoc.includes("plugin:ready"),
  pluginHostToIframeAck:
    pluginMessage.delivered === true &&
    isPluginAckMessage(pluginMessage.reply, plugin.id) &&
    pluginHostDocument.srcDoc.includes("plugin:ack") &&
    pluginHostDocument.srcDoc.includes("addEventListener(\"message\""),
  pluginSandboxAttrCorrect: pluginHostDocument.sandbox === "allow-scripts allow-forms",
  pluginMarketWorked: marketInstalled.id === "desk-notes",
  pluginUpdateWorked: updated.manifest.version === "0.2.0",
  pluginListWorked: pluginList.some((item) => item.id === "hello-plugin"),
  pluginSdkReady: pluginManager.getSdk().methods.includes("postMessage"),

  skillBuiltInsReady: ["code-review", "document-generation", "data-analysis"].every((name) => builtIns.some((skill) => skill.name === name)),
  skillInstalledByTool: installedByTool.installed === true && installedByTool.name === "tool-skill",
  skillInstallWorked: installedSkill.name === "research-skill" && loadedSkills.some((skill) => skill.name === "research-skill"),
  agentSkillVisible: loadedSkills.some((skill) => skill.name === "research-skill"),
  agentInvokedInstalledSkill:
    skillToolEvents.some((event) => event.toolCall.name === "skill_call" && event.toolCall.status === "running") &&
    skillToolEvents.some((event) => event.toolCall.name === "skill_call" && event.toolCall.status === "completed"),
  skillResultIncludedInAssistantResponse:
    Boolean(skillAssistant?.content.includes("[research-skill]")) &&
    Boolean(skillAssistant?.tool_results?.some((tool) => tool.name === "skill_call" && tool.status === "completed")),

  bridgeAdaptersReady: ["feishu", "dingtalk", "wechat"].every((id) => adapters.some((adapter) => adapter.id === id)),
  bridgeSessionsWorked:
    bridge.listSessions().length >= 3 &&
    ["feishu", "dingtalk", "wechat"].every((id) => bridge.listSessions().some((session) => session.adapterId === id)),
  localBridgeLoopback:
    feishuMessage.content === "飞书消息" &&
    dingtalkMessage.content === "钉钉消息" &&
    wechatMessage.content === "企微消息" &&
    feishuMessage.transport?.mode === "local" &&
    dingtalkMessage.transport?.mode === "local",
  bridgeEventsWorked: bridge.listEvents().some((event) => event.type === "message" && event.adapter === "feishu"),
  bridgeAgentRouteReady: files.bridgeBase.includes("transport") && files.sessionCoordinator.includes("tryInvokeSkill"),
  feishuAgentBridgeLoopWorked:
    feishuAgentRoute.inbound.sender === "feishu-user" &&
    feishuAgentRoute.assistantMessage.content.includes("[research-skill]") &&
    feishuAgentRoute.outbound.sender === "feishu-bot" &&
    feishuAgentRoute.outbound.transport?.mode === "local",
  dingtalkAgentBridgeLoopWorked:
    dingtalkAgentRoute.inbound.sender === "dingtalk-user" &&
    dingtalkAgentRoute.assistantMessage.content.includes("[research-skill]") &&
    dingtalkAgentRoute.outbound.sender === "dingtalk-bot" &&
    dingtalkAgentRoute.outbound.transport?.mode === "local",
  feishuConfigSchemaReady:
    files.feishu.includes("webhookUrl") &&
    files.feishu.includes("appId") &&
    files.feishu.includes("signingSecret") &&
    Boolean(feishuConfigured.createSignature("1", "n")),
  dingtalkConfigSchemaReady:
    files.dingtalk.includes("webhookUrl") &&
    files.dingtalk.includes("signingSecret") &&
    Boolean(dingtalkConfigured.createSignedWebhookUrl(1)?.includes("timestamp=1")),
  feishuInboundParsed: "content" in feishuInbound && feishuInbound.content === "入站飞书消息",
  dingtalkInboundParsed: dingtalkInbound?.content === "入站钉钉消息",
  realFeishuConfigured: realFeishu.configured,
  realFeishuVerified: realFeishu.verified,
  realFeishuTransport: realFeishu.transport,
  realDingTalkConfigured: realDingTalk.configured,
  realDingTalkVerified: realDingTalk.verified,
  realDingTalkTransport: realDingTalk.transport,

  sourceFilesReady:
    files.pluginManager.includes("getHostDocument") &&
    files.pluginManager.includes("iframe") &&
    files.skillManager.includes("builtInSkills") &&
    files.sessionCoordinator.includes("tryInvokeSkill") &&
    files.bridgeBase.includes("BridgeAdapter") &&
    files.feishu.includes("FeishuBridgeAdapter") &&
    files.dingtalk.includes("DingTalkBridgeAdapter") &&
    files.wechat.includes("WeChatBridgeAdapter"),
  externalIpcReady:
    ["plugins:install", "plugins:post-message", "plugins:host-document", "skills:install", "skills:execute", "bridge:create-session", "bridge:send"].every(
      (text) => files.ipc.includes(text)
    ) &&
    ["installPlugin", "postPluginMessage", "getPluginHostDocument", "installSkill", "executeSkill", "createBridgeSession", "sendBridgeMessage"].every(
      (text) => files.preload.includes(text)
    )
};

console.log(JSON.stringify(output, null, 2));

async function exists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for async verification");
}

async function verifyRealFeishuIfConfigured() {
  const webhookUrl = process.env.ZHIYUAN_FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return { configured: false, verified: false, transport: null };
  }

  const manager = BridgeSessionManager.withConfig({
    feishu: {
      webhookUrl,
      appId: process.env.ZHIYUAN_FEISHU_APP_ID,
      appSecret: process.env.ZHIYUAN_FEISHU_APP_SECRET,
      signingSecret: process.env.ZHIYUAN_FEISHU_SIGNING_SECRET
    }
  });
  const session = manager.createSession("feishu", process.env.ZHIYUAN_FEISHU_CONVERSATION_ID ?? "zhiyuan-verification");
  const message = await manager.send(session.id, "智元Agent V6 Day11 飞书真实 webhook 验证");
  return {
    configured: true,
    verified: message.transport?.mode === "webhook" && message.transport.attempted === true && message.transport.ok === true,
    transport: sanitizeTransport(message.transport)
  };
}

async function verifyRealDingTalkIfConfigured() {
  const webhookUrl = process.env.ZHIYUAN_DINGTALK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { configured: false, verified: false, transport: null };
  }

  const manager = BridgeSessionManager.withConfig({
    dingtalk: {
      webhookUrl,
      signingSecret: process.env.ZHIYUAN_DINGTALK_SIGNING_SECRET
    }
  });
  const session = manager.createSession("dingtalk", process.env.ZHIYUAN_DINGTALK_CONVERSATION_ID ?? "zhiyuan-verification");
  const message = await manager.send(session.id, "智元Agent V6 Day11 钉钉真实 webhook 验证");
  return {
    configured: true,
    verified: message.transport?.mode === "webhook" && message.transport.attempted === true && message.transport.ok === true,
    transport: sanitizeTransport(message.transport)
  };
}

function sanitizeTransport(transport) {
  if (!transport) {
    return null;
  }

  return {
    mode: transport.mode,
    attempted: transport.attempted,
    ok: transport.ok,
    status: transport.status,
    error: transport.error ? String(transport.error).slice(0, 120) : undefined
  };
}
