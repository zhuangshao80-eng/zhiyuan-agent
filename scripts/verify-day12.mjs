import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../dist/core/security/audit-log.js";
import { checkPermission } from "../dist/core/security/permission.js";
import { ExecutionBoundary } from "../dist/core/security/execution-boundary.js";
import { SessionPermissionModeRegistry } from "../dist/core/security/session-permission-mode.js";
import { GrantRegistry } from "../dist/core/security/grant-registry.js";
import { SessionCompactor } from "../dist/core/session-compactor.js";
import { SessionCoordinator } from "../dist/core/session-coordinator.js";
import { UsageLedger } from "../dist/core/usage-ledger.js";
import { terminalTool } from "../dist/lib/tools/terminal.js";
import { fileOpsTool } from "../dist/lib/tools/file-ops.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

class MockLlmClient {
  async chatCompletion() {
    async function* stream() {
      yield { type: "token", token: "模拟回复" };
    }
    return stream();
  }
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day12-"));
const agentDir = path.join(root, "agents", "default");
await fs.mkdir(agentDir, { recursive: true });

const auditLog = new AuditLog(path.join(agentDir, "security", "audit-log.jsonl"));
const auditEntry = await auditLog.record({
  action: "terminal.execute",
  subject: "agent",
  resource: "pwd",
  outcome: "allowed",
  detail: "verification"
});
await terminalTool.execute({ command: "pwd" }, { cwd: root, auditLog });
await terminalTool.execute({ command: "rm", args: ["-rf", "/"] }, { cwd: root, auditLog }).catch(() => undefined);
await fileOpsTool.execute({ action: "write", filePath: "safe.txt", content: "ok" }, { cwd: root, auditLog });
await fileOpsTool.execute({ action: "read", filePath: "../escape.txt" }, { cwd: root, auditLog }).catch(() => undefined);
const auditEntries = await auditLog.list();
const auditActions = new Set(auditEntries.map((entry) => entry.action));

const limitedExecute = checkPermission("limited", "execute");
const sandboxRead = checkPermission("sandbox", "read");
const boundary = new ExecutionBoundary({
  cwd: root,
  allowedCommands: ["pwd", "ls"],
  timeoutMs: 1000,
  maxOutputBytes: 4096
});
const boundaryAllowed = boundary.checkCommand("pwd", [], "trusted");
const boundaryDeniedCommand = boundary.checkCommand("rm", ["-rf", "/"], "trusted");
const boundaryDeniedMode = boundary.checkCommand("pwd", [], "sandbox");

const modeRegistry = new SessionPermissionModeRegistry();
modeRegistry.set("s1", "sandbox");
const grantRegistry = new GrantRegistry();
const grant = grantRegistry.grant({ subject: "agent", resource: "desk", level: "write" });

const longSession = {
  id: "long",
  title: "long",
  model: "deepseek:deepseek-chat",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: Array.from({ length: 10 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `历史消息 ${index}，包含需要压缩保留的信息。`,
    createdAt: new Date().toISOString(),
    tool_results: index === 3 ? [{ id: "tool-1", name: "web_search", arguments: { query: "智元" }, status: "completed", result: "搜索结果" }] : undefined
  }))
};
const compactor = new SessionCompactor({ maxMessages: 6, keepRecent: 3 });
const compacted = compactor.compact(longSession);

const usageLedger = new UsageLedger(path.join(agentDir, "usage-ledger.jsonl"));
await usageLedger.record({ sessionId: "s1", model: "deepseek:deepseek-chat", inputTokens: 12, outputTokens: 8 });
await usageLedger.record({ sessionId: "s1", model: "deepseek:deepseek-chat", inputTokens: 3, outputTokens: 7 });
const usageSummary = await usageLedger.summary();

const coordinatorEvents = [];
const coordinator = new SessionCoordinator({
  sessionsDir: path.join(agentDir, "sessions"),
  memoryDir: path.join(agentDir, "memory"),
  agentDir,
  auditLog,
  usageLedger,
  sessionCompactor: new SessionCompactor({ maxMessages: 4, keepRecent: 2 }),
  llmClient: new MockLlmClient()
});
let sessionId;
for (const content of ["第一条", "第二条", "第三条"]) {
  const result = await coordinator.sendMessage({ sessionId, content, model: "deepseek:deepseek-chat" }, (event) => coordinatorEvents.push(event));
  sessionId = result.sessionId;
  await waitFor(() => coordinatorEvents.filter((event) => event.type === "done").length >= (content === "第一条" ? 1 : content === "第二条" ? 2 : 3));
}
const restored = await coordinator.getSession(sessionId);
coordinator.dispose();

const zhPack = JSON.parse(await fs.readFile("lib/i18n/locales/zh-CN.json", "utf8"));
const enPack = JSON.parse(await fs.readFile("lib/i18n/locales/en.json", "utf8"));
const files = {
  settings: await fs.readFile("desktop/renderer/src/components/SettingsModal.tsx", "utf8"),
  app: await fs.readFile("desktop/renderer/src/App.tsx", "utf8"),
  i18n: await fs.readFile("desktop/renderer/src/i18n.ts", "utf8"),
  ipc: await fs.readFile("desktop/main/ipc.ts", "utf8"),
  preload: await fs.readFile("desktop/preload/index.ts", "utf8"),
  coordinator: await fs.readFile("core/session-coordinator.ts", "utf8")
};
const rendererChinese = await scanRendererChinese();

const output = {
  auditLogWritable: auditEntry.action === "terminal.execute" && auditEntries.some((entry) => entry.id === auditEntry.id),
  auditLogCoversHighRiskTools:
    auditActions.has("tool.terminal") &&
    auditActions.has("tool.file_ops") &&
    auditEntries.some((entry) => entry.action === "tool.terminal" && entry.outcome === "denied") &&
    auditEntries.some((entry) => entry.action === "tool.file_ops" && entry.outcome === "denied"),
  auditLogHasTimestampAndSubject: Boolean(auditEntries[0]?.createdAt) && auditEntries[0]?.subject === "agent",
  permissionLevelsWorked: limitedExecute.allowed === false && sandboxRead.allowed === true,
  executionBoundaryWhitelistWorked: boundaryAllowed.allowed === true && boundaryDeniedCommand.allowed === false,
  executionBoundaryModeWorked: boundaryDeniedMode.allowed === false,
  sessionPermissionModeWorked: modeRegistry.get("s1") === "sandbox" && modeRegistry.get("missing") === "limited",
  grantRegistryWorked: grantRegistry.has("agent", "desk", "write") === true && grantRegistry.revoke(grant.id) === true,
  sessionCompactorDetectedLongSession: compacted.compacted === true,
  sessionCompactorKeepsRecentAndSummary: compacted.session.messages[0].role === "system" && compacted.session.messages.length === 4,
  sessionCompactorPreservesToolResults: compacted.preservedToolResults === 1,
  compactedSessionCanContinue:
    restored?.messages.some((message) => message.role === "system" && message.content.includes("已压缩历史会话")) === true &&
    restored?.messages.at(-1)?.content.includes("模拟回复") === true,
  usageLedgerRecordsTokens: usageSummary.totalTokens === 30 && usageSummary.records >= 2,
  sessionCoordinatorUsageRecorded: (await usageLedger.summary()).records >= 5,
  i18nZhComplete: ["app.title", "settings.language", "usage.total"].every((key) => typeof zhPack[key] === "string"),
  i18nEnComplete: ["app.title", "settings.language", "usage.total"].every((key) => typeof enPack[key] === "string"),
  i18nDynamicLoadingReady: files.i18n.includes("loadLanguagePack") && files.i18n.includes("i18next"),
  languageSwitchUiReady:
    files.settings.includes("saveGeneralSettings") &&
    files.settings.includes("settings.languageHint") &&
    files.app.includes("shiftKey") &&
    files.app.includes("changeLanguage") &&
    zhPack["settings.languageHint"].includes("Command/Ctrl+Shift+L"),
  rendererChineseHardcodedCount: rendererChinese.count,
  rendererChineseHardcodedClean: rendererChinese.count === 0,
  usageLedgerSectionReady: files.settings.includes("UsageLedgerSection") && files.ipc.includes("usage:summary"),
  securityIpcReady: files.ipc.includes("security:audit-list") && files.preload.includes("listAuditLog"),
  auditIpcCoverageReady:
    [
      "provider.save-config",
      "provider.delete",
      "desk.write",
      "desk.delete",
      "cron.upsert",
      "plugin.install",
      "plugin.load",
      "plugin.post-message",
      "skill.install",
      "skill.execute",
      "bridge.send",
      "session.export",
      "settings.save"
    ].every((action) => files.ipc.includes(action)),
  sessionCoordinatorIntegrated:
    files.coordinator.includes("AuditLog") &&
    files.coordinator.includes("UsageLedger") &&
    files.coordinator.includes("SessionCompactor")
};

console.log(JSON.stringify(output, null, 2));

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for coordinator");
}

async function scanRendererChinese() {
  try {
    const { stdout } = await execFileAsync("rg", ["-n", "[\\p{Han}]", "desktop/renderer/src", "--glob", "!**/*.json"], {
      cwd: process.cwd()
    });
    const lines = String(stdout)
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    return { count: lines.length, lines };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 1) {
      return { count: 0, lines: [] };
    }
    throw error;
  }
}
