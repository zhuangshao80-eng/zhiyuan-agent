import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent } from "../dist/core/agent.js";
import { AutomationRunner } from "../dist/lib/desk/automation.js";
import { CronScheduler } from "../dist/lib/desk/cron-scheduler.js";
import { CronStore } from "../dist/lib/desk/cron-store.js";
import { DeskManager } from "../dist/lib/desk/desk-manager.js";
import { createCoreToolRegistry, createCoreTools } from "../dist/lib/tools/core-tools.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day8-"));
const agentsDir = path.join(root, "agents");
const agentDir = path.join(agentsDir, "default");
const memoryDir = path.join(agentDir, "memory");
await fs.mkdir(memoryDir, { recursive: true });
await writeConfig(true);

const desk = new DeskManager(agentDir);
const deskPaths = await desk.ensure();
const store = new CronStore(agentDir);
const job = await store.upsert({ name: "Day8 cron", schedule: "every 1m", task: "ping" });
const scheduler = new CronScheduler(store, agentDir, async (cronJob) => `ran:${cronJob.task}`);
const runs = await scheduler.tick(new Date("2026-06-10T12:00:00.000Z"));

await writeConfig(false);
const blockedJob = await store.upsert({ name: "Blocked cron", schedule: "every 1m", task: "blocked" });
const blockedRuns = await scheduler.tick(new Date("2026-06-10T12:02:00.000Z"));

const automation = new AutomationRunner(agentDir);
await automation.save({ id: "auto_day8", name: "Day8 automation", steps: [{ tool: "todo", args: { action: "list" } }] });
const automationRun = await automation.run("auto_day8");

const registry = createCoreToolRegistry();
const coreTools = createCoreTools();
const byName = Object.fromEntries(coreTools.map((tool) => [tool.name, tool]));
const sub = await byName.subagent.execute({ prompt: "准备 Day8 子任务", label: "day8" }, { agentDir, cwd: root, parentSessionId: "parent_day8" });
const [replyA, replyB] = await Promise.all([
  byName.subagent_reply.execute({ threadId: sub.threadId, task: "第一步" }, { agentDir, cwd: root }),
  byName.subagent_reply.execute({ threadId: sub.threadId, task: "第二步" }, { agentDir, cwd: root })
]);
const closed = await byName.subagent_close.execute({ threadId: sub.threadId }, { agentDir, cwd: root });
const subagentSession = JSON.parse(await fs.readFile(sub.sessionPath, "utf8"));
const replyAfterCloseRejected = await rejects(() => byName.subagent_reply.execute({ threadId: sub.threadId, task: "关闭后任务" }, { agentDir, cwd: root }));
const readonlySub = await byName.subagent.execute(
  { prompt: "只读父上下文", label: "readonly-check" },
  { agentDir, cwd: root, access: "readonly", parentSessionId: "parent_readonly" }
);
const readonlyEscalation = await byName.subagent.execute(
  { prompt: "尝试提权", label: "readonly-escalate", access: "full" },
  { agentDir, cwd: root, access: "readonly", parentSessionId: "parent_readonly" }
);
const readonlySession = JSON.parse(await fs.readFile(readonlySub.sessionPath, "utf8"));
const escalationSession = JSON.parse(await fs.readFile(readonlyEscalation.sessionPath, "utf8"));

await writeConfig(true);
const agent = new Agent({ id: "default", agentsDir, productDir: root, userDir: path.join(root, "user") });
await agent.init();
const snapshot = agent.getToolsSnapshot();
await agent.dispose();

const cronToolJob = await byName.cron_tool.execute(
  { action: "create", name: "tool cron", schedule: "every 1m", task: "from tool" },
  { agentDir, cwd: root }
);
const channel = await byName.channel_tool.execute({ action: "post", channel: "ops", message: "hello" }, { agentDir, cwd: root });
const skill = await byName.install_skill.execute({ name: "demo-skill", source: "local" }, { agentDir, cwd: root });
const folder = await byName.session_folders.execute({ action: "assign", folder: "验收", sessionId: "session_day8" }, { agentDir, cwd: root });
const status = await byName.current_status.execute({}, { agentDir, cwd: root });

const expectedRemainingTools = [
  "subagent",
  "subagent_reply",
  "subagent_close",
  "browser",
  "computer_use",
  "cron_tool",
  "automation_tool",
  "channel_tool",
  "dm_tool",
  "workflow_tool",
  "install_skill",
  "session_folders",
  "check_deferred",
  "current_status",
  "stop_task",
  "experience"
];

const output = {
  deskDirsReady:
    (await exists(deskPaths.deskDir)) &&
    (await exists(deskPaths.cronRunsDir)) &&
    (await exists(deskPaths.automationsDir)) &&
    (await exists(deskPaths.channelsDir)),
  cronPersisted: (await store.list()).some((item) => item.id === job.id),
  cronSchedulerRan: runs.some((run) => run.jobId === job.id && run.status === "completed" && run.output === "ran:ping"),
  cronPermissionSkipped: blockedRuns.some((run) => run.jobId === blockedJob.id && run.status === "skipped"),
  automationSavedAndRan: automationRun.status === "completed" && automationRun.steps.length === 1,
  subagentCreated: typeof sub.threadId === "string" && sub.threadId.startsWith("subagent_"),
  subagentQueueWorked: replyA.threadId === sub.threadId && replyB.threadId === sub.threadId,
  subagentClosed: closed.closed === true,
  subagentIndependentSession: sub.sessionPath.includes(path.join("sessions", "subagents")) && subagentSession.threadId === sub.threadId,
  subagentSessionPersisted: subagentSession.parentSessionId === "parent_day8" && subagentSession.messages.length >= 6,
  subagentReplyPersisted: subagentSession.messages.some((message) => message.content === "第二步"),
  subagentReadonlyInherited: readonlySub.access === "readonly" && readonlySession.access === "readonly",
  subagentCannotEscalateFromReadonly: readonlyEscalation.access === "readonly" && escalationSession.access === "readonly",
  replyAfterCloseRejected,
  remainingToolsRegistered: expectedRemainingTools.every((name) => registry.get(name)),
  coreToolCount: coreTools.length,
  agentToolCountWithMemory: snapshot.length,
  agentHas26PlusTools: snapshot.length >= 26,
  defaultDisabledApplied:
    snapshot.find((tool) => tool.name === "dm_tool")?.enabled === false &&
    snapshot.find((tool) => tool.name === "workflow_tool")?.enabled === false &&
    snapshot.find((tool) => tool.name === "experience")?.enabled === false,
  cronToolCallable: typeof cronToolJob.id === "string",
  channelToolCallable: channel.posted === true,
  installSkillCallable: skill.installed === true,
  sessionFoldersCallable: Array.isArray(folder.sessions) && folder.sessions.includes("session_day8"),
  currentStatusCallable: status.status === "ready"
};

console.log(JSON.stringify(output, null, 2));

async function writeConfig(autoApprove) {
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(
    path.join(agentDir, "config.yaml"),
    [
      "agent:",
      "  name: 小元",
      "  yuan: zhiyuan",
      "user:",
      "  name: 验收员",
      "locale: zh-CN",
      "models:",
      "  chat: deepseek:deepseek-chat",
      "  utility: deepseek:deepseek-chat",
      "  utility_large: deepseek:deepseek-chat",
      "memory:",
      "  enabled: true",
      "tools:",
      "  disabled: []",
      "desk:",
      `  cron_auto_approve: ${autoApprove ? "true" : "false"}`,
      ""
    ].join("\n"),
    "utf8"
  );
}

function exists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function rejects(action) {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}
