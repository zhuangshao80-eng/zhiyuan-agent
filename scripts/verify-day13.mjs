import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FactStore } from "../dist/lib/memory/fact-store.js";
import { buildSystemPrompt } from "../dist/lib/persona/system-prompt.js";
import { systemPromptCache } from "../dist/lib/persona/prompt-cache.js";

const execFileAsync = promisify(execFile);
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const workflow = await fs.readFile(".github/workflows/build.yml", "utf8");
const files = {
  autoUpdater: await fs.readFile("desktop/main/auto-updater.ts", "utf8"),
  ipc: await fs.readFile("desktop/main/ipc.ts", "utf8"),
  preload: await fs.readFile("desktop/preload/index.ts", "utf8"),
  app: await fs.readFile("desktop/renderer/src/App.tsx", "utf8"),
  i18n: await fs.readFile("desktop/renderer/src/i18n.ts", "utf8"),
  chatArea: await fs.readFile("desktop/renderer/src/components/ChatArea.tsx", "utf8"),
  messageBubble: await fs.readFile("desktop/renderer/src/components/MessageBubble.tsx", "utf8"),
  toolCall: await fs.readFile("desktop/renderer/src/components/ToolCallBlock.tsx", "utf8"),
  factStore: await fs.readFile("lib/memory/fact-store.ts", "utf8"),
  agent: await fs.readFile("core/agent.ts", "utf8"),
  engine: await fs.readFile("core/engine.ts", "utf8"),
  cli: await fs.readFile("cli/index.ts", "utf8")
};
const docs = {
  user: await fs.readFile("docs/user-guide.md", "utf8"),
  developer: await fs.readFile("docs/developer-guide.md", "utf8"),
  release: await fs.readFile("docs/release-checklist.md", "utf8")
};

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day13-"));
const agentDir = path.join(root, "agents", "default");
await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });
await fs.writeFile(
  path.join(agentDir, "config.yaml"),
  "agent:\n  name: ZhiYuan\n  yuan: zhiyuan\nuser:\n  name: User\nlocale: zh-CN\nmodels:\n  chat: deepseek:deepseek-chat\n  utility: deepseek:deepseek-chat\n  utility_large: deepseek:deepseek-chat\nmemory:\n  enabled: true\ntools:\n  disabled: []\ndesk:\n  cron_auto_approve: true\n",
  "utf8"
);
await buildSystemPrompt({ agentDir, productDir: root, toolDisciplinePrompt: "discipline" });
await buildSystemPrompt({ agentDir, productDir: root, toolDisciplinePrompt: "discipline" });
const promptStats = systemPromptCache.stats();

const factStore = new FactStore(path.join(agentDir, "memory", "facts.db"));
factStore.add({ fact: "用户喜欢深色界面", tags: ["preference"] });
const searchHit = factStore.search({ keyword: "深色", limit: 5 }).length > 0;
factStore.optimize();
factStore.close();

const cliHelp = await execFileAsync(process.execPath, ["dist/cli/index.js", "help"], { cwd: process.cwd() }).catch((error) => ({
  stdout: error.stdout ?? "",
  stderr: error.stderr ?? ""
}));

const output = {
  windowsMacHardRequirementReady:
    pkg.build?.win?.target?.[0]?.target === "nsis" &&
    pkg.build?.mac?.target?.includes("dmg") &&
    pkg.scripts["dist:win"]?.includes("--win nsis") &&
    pkg.scripts["dist:mac"]?.includes("--mac dmg") &&
    workflow.includes("windows-latest") &&
    workflow.includes("macos-latest"),
  builderScriptsReady:
    ["pack", "dist", "dist:mac", "dist:win", "dist:linux"].every((script) => pkg.scripts[script]?.includes("electron-builder")) &&
    pkg.build?.win?.target?.[0]?.target === "nsis" &&
    pkg.build?.mac?.target?.includes("dmg") &&
    pkg.build?.linux?.target?.includes("AppImage") &&
    pkg.build?.linux?.target?.includes("deb"),
  githubActionsReady:
    workflow.includes("macos-latest") &&
    workflow.includes("windows-latest") &&
    workflow.includes("ubuntu-latest") &&
    workflow.includes("npm run typecheck") &&
    workflow.includes("upload-artifact"),
  autoUpdaterReady:
    files.autoUpdater.includes("checkForUpdates") &&
    files.autoUpdater.includes("downloadUpdate") &&
    files.autoUpdater.includes("quitAndInstall") &&
    files.ipc.includes("updates:check") &&
    files.preload.includes("checkForUpdates"),
  updateUiReady:
    files.app.includes("UpdateNotice") &&
    files.app.includes("downloadUpdate") &&
    files.app.includes("installUpdate") &&
    files.app.includes("onUpdateStatus"),
  promptCacheWorked: promptStats.size >= 1 && promptStats.hits >= 1,
  streamingFirstTokenReady: files.app.includes("applyStreamEvent") && files.chatArea.includes("isStreaming") && files.app.includes("event.type === \"token\""),
  memoryFtsOptimized: searchHit && files.factStore.includes("facts_fts") && files.factStore.includes("bm25") && files.factStore.includes("optimize()"),
  reactMemoReady: files.messageBubble.includes("memo(") && files.toolCall.includes("memo(") && files.chatArea.includes("MemoizedChatArea"),
  virtualScrollReady: files.chatArea.includes("visibleMessages") && files.chatArea.includes("messages.slice(-120)"),
  disposeReady: files.agent.includes("dispose") && files.engine.includes("agentManager.dispose") && files.engine.includes("eventHandlers.clear"),
  startupLazyLoadReady: files.i18n.includes("import(\"../../../lib/i18n/locales") && files.autoUpdater.includes("autoDownload = false"),
  cliChatReady: files.cli.includes("startChat") && files.cli.includes("readline") && files.cli.includes("SessionCoordinator"),
  cliServerReady:
    pkg.bin?.zhiyuan === "dist/cli/index.js" &&
    files.cli.includes("command === \"serve\"") &&
    files.cli.includes("startServer") &&
    files.cli.includes("http.createServer") &&
    files.cli.includes("/chat"),
  cliHelpWorked: String(cliHelp.stdout).includes("zhiyuan chat") && String(cliHelp.stdout).includes("zhiyuan serve"),
  docsReady:
    docs.user.includes("Install And Launch") &&
    docs.user.includes("zhiyuan serve") &&
    docs.developer.includes("Packaging") &&
    docs.developer.includes("Automatic Updates") &&
    docs.release.includes("Windows") &&
    docs.release.includes("macOS")
};

console.log(JSON.stringify(output, null, 2));
