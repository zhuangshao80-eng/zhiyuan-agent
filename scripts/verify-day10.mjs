import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionCoordinator } from "../dist/core/session-coordinator.js";
import { ChannelManager } from "../dist/lib/channels/channel-manager.js";
import { CronStore } from "../dist/lib/desk/cron-store.js";
import { DeskManager } from "../dist/lib/desk/desk-manager.js";
import { importDroppedTextFiles, sanitizeDeskUploadName } from "../dist/lib/desk/desk-upload.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day10-"));
const agentDir = path.join(root, "agents", "default");
await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });
await fs.writeFile(
  path.join(agentDir, "config.yaml"),
  "agent:\n  name: 小元\n  yuan: zhiyuan\nuser:\n  name: 验收员\nmodels:\n  chat: deepseek:deepseek-chat\n  utility: deepseek:deepseek-chat\n  utility_large: deepseek:deepseek-chat\nmemory:\n  enabled: true\ntools:\n  disabled: []\ndesk:\n  cron_auto_approve: true\n",
  "utf8"
);

const channelManager = new ChannelManager(agentDir);
const channel = await channelManager.createChannel({ name: "研发", topic: "Day10验收" });
const message = await channelManager.postMessage(channel.id, "频道消息");
const dm = await channelManager.createChannel({ name: "用户", dm: true });
const dmMessage = await channelManager.postMessage(dm.id, "私信消息");
const channels = await channelManager.listChannels();
const messages = await channelManager.listMessages(channel.id);
await channelManager.deleteChannel(channel.id);
const channelDeleted = !(await channelManager.listChannels()).some((item) => item.id === channel.id);

const desk = new DeskManager(agentDir);
const deskPaths = await desk.ensure();
await fs.writeFile(path.join(deskPaths.deskDir, "notes.md"), "# Desk\n", "utf8");
const deskFileWritten = (await fs.readFile(path.join(deskPaths.deskDir, "notes.md"), "utf8")).includes("Desk");
const uploadedTree = [];
const uploadResult = await importDroppedTextFiles(
  [
    { name: "upload.md", type: "text/markdown", text: async () => "# 上传\n" },
    { name: "upload.md", type: "text/markdown", text: async () => "# 重名\n" },
    { name: "image.png", type: "image/png", text: async () => "binary" }
  ],
  async (filePath, content) => {
    await fs.writeFile(path.join(deskPaths.deskDir, filePath), content, "utf8");
    uploadedTree.push({ name: filePath, path: filePath, type: "file" });
    return uploadedTree;
  },
  ["notes.md"]
);
const unsafeRejected = (() => {
  try {
    sanitizeDeskUploadName("../pwn.md");
    return false;
  } catch {
    return true;
  }
})();
const cronStore = new CronStore(agentDir);
const cron = await cronStore.upsert({ name: "Day10 cron", schedule: "every 1m", task: "检查Desk" });
await cronStore.setEnabled(cron.id, false);
const cronDisabled = (await cronStore.list()).find((item) => item.id === cron.id)?.enabled === false;

const coordinator = new SessionCoordinator({
  sessionsDir: path.join(agentDir, "sessions"),
  memoryDir: path.join(agentDir, "memory"),
  llmClient: {
    async chatCompletion() {
      return (async function* stream() {
        yield { type: "token", token: "ok" };
      })();
    }
  }
});
const session = await coordinator.create("deepseek:deepseek-chat");
const renamed = await coordinator.rename(session.id, "重命名会话");
const exported = await coordinator.export(session.id, path.join(root, "artifacts"));
await coordinator.destroy(session.id);
const deleted = !(await coordinator.getSession(session.id));
coordinator.dispose();

const files = {
  app: await fs.readFile("desktop/renderer/src/App.tsx", "utf8"),
  channelPanel: await fs.readFile("desktop/renderer/src/components/ChannelPanel.tsx", "utf8"),
  deskPanel: await fs.readFile("desktop/renderer/src/components/DeskPanel.tsx", "utf8"),
  ipc: await fs.readFile("desktop/main/ipc.ts", "utf8"),
  preload: await fs.readFile("desktop/preload/index.ts", "utf8")
};

const output = {
  channelCreateWorked: channels.some((item) => item.id === channel.id),
  channelMessageWorked: messages.some((item) => item.id === message.id && item.content === "频道消息"),
  channelDeleteWorked: channelDeleted,
  dmWorked: dm.dm === true && dmMessage.dm === true,
  deskManagerReady: Boolean(deskPaths.deskDir && deskPaths.cronJobsPath),
  deskFileWorked: deskFileWritten,
  deskDropHandlersReady: files.deskPanel.includes("onDragOver") && files.deskPanel.includes("onDragLeave") && files.deskPanel.includes("onDrop"),
  deskDropUploadWorked:
    uploadResult.imported.includes("upload.md") &&
    uploadResult.imported.includes("upload-1.md") &&
    (await exists(path.join(deskPaths.deskDir, "upload.md"))) &&
    uploadResult.rejected.some((item) => item.name === "image.png"),
  deskDropRejectsUnsafePath: unsafeRejected,
  cronJobManagerWorked: cronDisabled,
  sessionRenameWorked: renamed?.title === "重命名会话",
  sessionExportWorked: (await exists(exported.path)),
  sessionDeleteWorked: deleted,
  channelFrontendReady: ["ChannelTab", "ChannelList", "ChannelHeader", "ChannelCreateOverlay"].every((text) => files.channelPanel.includes(text)),
  deskFrontendReady: ["DeskEditor", "DeskTree", "DeskToolbar", "DeskCwdSkills", "DeskDropZone", "CronJobManager"].every((text) => files.deskPanel.includes(text)),
  sidebarReady: ["ChatSidebar", "SessionSwitcher", "WorkspaceCompanionRail", "chat.longSessionHint", "chat.searchSessions"].every((text) => files.app.includes(text)),
  ipcBridgeReady: [
    "channels:create",
    "channels:post",
    "desk:tree",
    "desk:write",
    "cron:upsert",
    "chat:rename-session",
    "chat:export-session"
  ].every((text) => files.ipc.includes(text)),
  preloadReady: ["listChannels", "postChannelMessage", "getDeskTree", "upsertCronJob", "renameSession", "exportSession"].every((text) => files.preload.includes(text))
};

console.log(JSON.stringify(output, null, 2));

async function exists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}
