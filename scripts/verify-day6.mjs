import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent } from "../dist/core/agent.js";
import { SessionCoordinator } from "../dist/core/session-coordinator.js";
import { createCoreToolRegistry, createCoreTools } from "../dist/lib/tools/core-tools.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day6-"));
const agentDir = path.join(root, "agents", "default");
const memoryDir = path.join(agentDir, "memory");
const sessionsDir = path.join(agentDir, "sessions");
const workspaceDir = path.join(root, "workspace");
const escapeDir = path.join(root, "workspace-escape");
await fs.mkdir(memoryDir, { recursive: true });
await fs.mkdir(sessionsDir, { recursive: true });
await fs.mkdir(workspaceDir, { recursive: true });
await fs.mkdir(escapeDir, { recursive: true });
await fs.writeFile(path.join(escapeDir, "pwn.txt"), "outside", "utf8");
await fs.symlink(escapeDir, path.join(workspaceDir, "link-out")).catch((error) => {
  if (error?.code !== "EEXIST") throw error;
});
await fs.writeFile(
  path.join(agentDir, "config.yaml"),
  [
    "agent:",
    "  name: 智元Agent",
    "  yuan: default",
    "user:",
    "  name: 验收员",
    'locale: "zh-CN"',
    "models:",
    "  chat: deepseek:deepseek-chat",
    "  utility: deepseek:deepseek-chat",
    "  utility_large: deepseek:deepseek-chat",
    "memory:",
    "  enabled: true",
    "tools:",
    "  disabled:",
    "    - terminal",
    "    - web_fetch",
    "desk:",
    "  cron_auto_approve: true",
    ""
  ].join("\n"),
  "utf8"
);

globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  url: String(url),
  async text() {
    return "<html><head><title>验收页</title></head><body><h1>智元工具</h1><p>HTML 内容转换 Markdown。</p></body></html>";
  }
});

const registry = createCoreToolRegistry(["terminal"]);
const coreTools = createCoreTools();
const toolsByName = Object.fromEntries(coreTools.map((tool) => [tool.name, tool]));
const day6ToolNames = ["web_search", "web_fetch", "todo", "terminal", "file_ops", "notify", "stage_files", "update_settings"];
const toolResults = {};
for (const tool of coreTools) {
  if (tool.name === "web_search") {
    toolResults[tool.name] = await tool.execute({ query: "智元Agent Day6", engine: "local" }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "web_fetch") {
    toolResults[tool.name] = await tool.execute({ url: "https://example.test/day6" }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "todo") {
    const created = await tool.execute({ action: "create", title: "完成 Day6 工具验收" }, { agentDir, cwd: workspaceDir });
    const listed = await tool.execute({ action: "list" }, { agentDir, cwd: workspaceDir });
    toolResults[tool.name] = { created: Boolean(created.id), count: listed.length };
  } else if (tool.name === "terminal") {
    toolResults[tool.name] = await tool.execute({ command: "pwd", args: [], timeoutMs: 1000 }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "file_ops") {
    await tool.execute({ action: "write", filePath: "note.txt", content: "Day6 file_ops grep target" }, { agentDir, cwd: workspaceDir });
    await tool.execute({ action: "edit", filePath: "note.txt", search: "target", replace: "passed" }, { agentDir, cwd: workspaceDir });
    toolResults[tool.name] = await tool.execute({ action: "grep", pattern: "passed" }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "notify") {
    toolResults[tool.name] = await tool.execute({ title: "Day6", message: "通知工具验收" }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "stage_files") {
    toolResults[tool.name] = await tool.execute({ files: ["note.txt"], note: "Day6 staged" }, { agentDir, cwd: workspaceDir });
  } else if (tool.name === "update_settings") {
    toolResults[tool.name] = await tool.execute({ keyPath: "tools.disabled", value: ["terminal", "web_fetch"] }, { agentDir, cwd: workspaceDir });
  }
}

const terminalRmRejected = await rejects(() =>
  toolsByName.terminal.execute({ command: "rm", args: ["-rf", "/"], timeoutMs: 1000 }, { agentDir, cwd: workspaceDir })
);
const terminalShellMetaRejected = await rejects(() =>
  toolsByName.terminal.execute({ command: "ls", args: [";"], timeoutMs: 1000 }, { agentDir, cwd: workspaceDir })
);
const fileOpsEscapeWriteRejected = await rejects(() =>
  toolsByName.file_ops.execute({ action: "write", filePath: "../workspace-escape/pwn-write.txt", content: "pwned" }, { agentDir, cwd: workspaceDir })
);
const fileOpsEscapeReadRejected = await rejects(() =>
  toolsByName.file_ops.execute({ action: "read", filePath: "../workspace-escape/pwn.txt" }, { agentDir, cwd: workspaceDir })
);
const fileOpsEscapeEditRejected = await rejects(() =>
  toolsByName.file_ops.execute({ action: "edit", filePath: "../workspace-escape/pwn.txt", search: "outside", replace: "pwned" }, { agentDir, cwd: workspaceDir })
);
const fileOpsSymlinkReadRejected = await rejects(() =>
  toolsByName.file_ops.execute({ action: "read", filePath: "link-out/pwn.txt" }, { agentDir, cwd: workspaceDir })
);
const fileOpsSymlinkWriteRejected = await rejects(() =>
  toolsByName.file_ops.execute({ action: "write", filePath: "link-out/pwn-symlink.txt", content: "pwned" }, { agentDir, cwd: workspaceDir })
);
await toolsByName.file_ops.execute({ action: "write", filePath: "safe/note.txt", content: "inside" }, { agentDir, cwd: workspaceDir });
const fileOpsInsideWriteWorked = (await toolsByName.file_ops.execute({ action: "read", filePath: "safe/note.txt" }, { agentDir, cwd: workspaceDir })).content === "inside";
const fileOpsGlobSkipsSymlink = !(await toolsByName.file_ops.execute({ action: "glob", pattern: "pwn" }, { agentDir, cwd: workspaceDir })).some((file) =>
  file.includes("link-out")
);
const stageFilesEscapeRejected = await rejects(() =>
  toolsByName.stage_files.execute({ files: ["../workspace-escape/pwn-stage.txt"], note: "should reject" }, { agentDir, cwd: workspaceDir })
);

const agent = new Agent({
  id: "default",
  agentsDir: path.join(root, "agents"),
  productDir: root,
  userDir: root
});
await agent.init();
const snapshot = agent.getToolsSnapshot();
await agent.dispose();

const captured = [];
const llmClient = {
  async chatCompletion(request) {
    captured.push(request);
    return (async function* stream() {
      yield { type: "token", token: "ok" };
    })();
  }
};
const coordinator = new SessionCoordinator({
  sessionsDir,
  memoryDir,
  llmClient,
  disabledTools: ["web_search", "memory_search"]
});
const events = [];
await coordinator.sendMessage(
  { model: "deepseek:deepseek-chat", content: "搜索 智元Agent" },
  (event) => events.push(event)
);
await waitFor(() => events.some((event) => event.type === "done"), 1000);
coordinator.dispose();

const enabledCoordinator = new SessionCoordinator({
  sessionsDir: path.join(agentDir, "sessions-enabled"),
  memoryDir,
  llmClient
});
const enabledEvents = [];
await enabledCoordinator.sendMessage(
  { model: "deepseek:deepseek-chat", content: "普通工具纪律检查" },
  (event) => enabledEvents.push(event)
);
await waitFor(() => enabledEvents.some((event) => event.type === "done"), 1000);
enabledCoordinator.dispose();

const disabledRequest = captured[0];
const enabledRequest = captured[1];
const output = {
  coreToolCount: coreTools.length,
  day6ToolCount: day6ToolNames.length,
  coreToolsCallable: day6ToolNames.every((name) => Object.hasOwn(toolResults, name)),
  registryTerminalEnabled: registry.isEnabled("terminal"),
  registryWebSearchEnabled: registry.isEnabled("web_search"),
  agentSnapshotHasCoreTools: ["web_search", "web_fetch", "todo", "terminal", "file_ops", "notify", "stage_files", "update_settings"].every((name) =>
    snapshot.some((tool) => tool.name === name)
  ),
  agentSnapshotDisabledApplied:
    snapshot.find((tool) => tool.name === "terminal")?.enabled === false &&
    snapshot.find((tool) => tool.name === "web_fetch")?.enabled === false,
  sessionDisabledToolsHidden:
    disabledRequest.tools.length === 0 && !events.some((event) => event.type === "tool_call" && event.toolCall.name === "web_search"),
  sessionEnabledToolsVisible: enabledRequest.tools.some((tool) => tool.function.name === "web_search"),
  disciplinePromptInjected: enabledRequest.messages.some(
    (message) =>
      message.role === "system" &&
      message.content.includes("多工具可选时优先用成本最低的") &&
      message.content.includes("web_search > web_fetch > browser")
  ),
  todoPersisted: toolResults.todo.count === 1,
  fileOpsWorked: Array.isArray(toolResults.file_ops) && toolResults.file_ops.length === 1,
  notifyWorked: toolResults.notify.delivered === true,
  stageFilesWorked: toolResults.stage_files.staged.length === 1,
  updateSettingsWorked: toolResults.update_settings.updated === true,
  webFetchMarkdown: toolResults.web_fetch.markdown.includes("# 智元工具"),
  terminalRmRejected,
  terminalShellMetaRejected,
  fileOpsEscapeRejected: fileOpsEscapeWriteRejected && fileOpsEscapeReadRejected && fileOpsEscapeEditRejected,
  fileOpsSymlinkEscapeRejected: fileOpsSymlinkReadRejected && fileOpsSymlinkWriteRejected,
  fileOpsGlobSkipsSymlink,
  fileOpsInsideWriteWorked,
  stageFilesEscapeRejected
};

console.log(JSON.stringify(output, null, 2));

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for async session event");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function rejects(action) {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}
