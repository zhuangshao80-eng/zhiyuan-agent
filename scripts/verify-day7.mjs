import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent } from "../dist/core/agent.js";
import { SessionCoordinator } from "../dist/core/session-coordinator.js";
import { buildSystemPrompt } from "../dist/lib/persona/system-prompt.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhiyuan-day7-"));
const agentsDir = path.join(root, "agents");
const agentDir = path.join(agentsDir, "default");
const memoryDir = path.join(agentDir, "memory");
const sessionsDir = path.join(agentDir, "sessions");
await fs.mkdir(memoryDir, { recursive: true });
await fs.mkdir(sessionsDir, { recursive: true });
await fs.writeFile(path.join(memoryDir, "pinned.md"), "置顶：用户喜欢简洁界面。", "utf8");
await fs.writeFile(path.join(memoryDir, "memory.md"), "# 记忆\n- 用户生日是 3月14日。", "utf8");
await writeConfig("zhiyuan");

const zhiyuan = await buildSystemPrompt({ agentDir, productDir: root, userDir: path.join(root, "user"), now: fixedNow() });
await writeConfig("lingxi");
const lingxi = await buildSystemPrompt({ agentDir, productDir: root, userDir: path.join(root, "user"), now: fixedNow() });
await writeConfig("yanjin");
const yanjin = await buildSystemPrompt({ agentDir, productDir: root, userDir: path.join(root, "user"), now: fixedNow() });

await fs.writeFile(path.join(agentDir, "identity.md"), "自定义身份：{{agentName}}/{{agentId}}/{{userName}}", "utf8");
const overridePrompt = await buildSystemPrompt({ agentDir, productDir: root, userDir: path.join(root, "user"), now: fixedNow() });
await fs.rm(path.join(agentDir, "identity.md"));

await writeConfig("zhiyuan");
const agent = new Agent({ id: "default", agentsDir, productDir: root, userDir: path.join(root, "user") });
await agent.init();
const beforeSwitch = await agent.buildSystemPrompt();
await agent.updateConfig({ agent: { yuan: "lingxi" } });
const afterSwitch = await agent.buildSystemPrompt();
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
  agentDir,
  sessionsDir,
  memoryDir,
  productDir: root,
  userDir: path.join(root, "user"),
  llmClient
});
const events = [];
await coordinator.sendMessage({ model: "deepseek:deepseek-chat", content: "检查人格 prompt" }, (event) => events.push(event));
await waitFor(() => events.some((event) => event.type === "done"), 1000);
coordinator.dispose();

const requestPrompt = captured[0].messages.find((message) => message.role === "system")?.content ?? "";
const output = {
  yuanTypesAvailable:
    zhiyuan.prompt.includes("默认人格") && lingxi.prompt.includes("灵犀型 Agent") && yanjin.prompt.includes("严谨型 Agent"),
  templateVariablesReplaced:
    zhiyuan.prompt.includes("小元") && zhiyuan.prompt.includes("验收员") && zhiyuan.prompt.includes("default") && !zhiyuan.prompt.includes("{{"),
  templatePriorityOverride:
    overridePrompt.prompt.includes("自定义身份：小元/default/验收员") && overridePrompt.sources.identity.endsWith("identity.md"),
  staticBeforeDynamic: zhiyuan.prompt.indexOf("# 静态区") < zhiyuan.prompt.indexOf("# 动态区"),
  staticPrefixCacheStable: zhiyuan.staticPrefix === lingxi.staticPrefix,
  dynamicTailChangesByYuan: zhiyuan.dynamicTail !== lingxi.dynamicTail && lingxi.dynamicTail !== yanjin.dynamicTail,
  sectionOrderCorrect: ordered(zhiyuan.prompt, [
    "## 平台声明",
    "## 执行环境",
    "## 行为指南",
    "## 工具纪律",
    "## 安全规则",
    "## 技能声明",
    "## 用户档案",
    "## identity",
    "## yuan",
    "## ishiki",
    "## 工作台",
    "## 工作区说明",
    "## 记忆规则",
    "## 置顶记忆",
    "## 记忆内容",
    "## 当前时间"
  ]),
  pinnedMemoryIncluded: zhiyuan.prompt.includes("置顶：用户喜欢简洁界面。"),
  compiledMemoryIncluded: zhiyuan.prompt.includes("用户生日是 3月14日"),
  updateConfigYuanImmediate: beforeSwitch.includes("默认人格") && afterSwitch.includes("灵犀型 Agent"),
  sessionPromptInjected: requestPrompt.includes("# 静态区") && requestPrompt.includes("# 动态区") && requestPrompt.includes("灵犀型 Agent")
};

console.log(JSON.stringify(output, null, 2));

async function writeConfig(yuan) {
  await fs.writeFile(
    path.join(agentDir, "config.yaml"),
    [
      "agent:",
      "  name: 小元",
      `  yuan: ${yuan}`,
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
      "  cron_auto_approve: true",
      ""
    ].join("\n"),
    "utf8"
  );
}

function fixedNow() {
  return new Date("2026-06-10T12:00:00.000Z");
}

function ordered(text, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index <= cursor) return false;
    cursor = index;
  }
  return true;
}

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for session response");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
