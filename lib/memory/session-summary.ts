import fs from "node:fs/promises";
import path from "node:path";
import type { ChatSession, SessionMessage } from "../../shared/types.js";

export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  keyFacts: string[];
  decisions: string[];
  todos: string[];
  userPreferences: string[];
}

export async function generateSessionSummary(session: ChatSession, memoryDir: string): Promise<SessionSummary> {
  const summary = summarizeSession(session);
  const summariesDir = path.join(memoryDir, "summaries");
  await fs.mkdir(summariesDir, { recursive: true });
  await fs.writeFile(path.join(summariesDir, `${session.id}.md`), renderSessionSummary(summary), "utf8");
  await fs.writeFile(path.join(summariesDir, `${session.id}.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

export function summarizeSession(session: ChatSession): SessionSummary {
  const userMessages = session.messages.filter((message) => message.role === "user");
  const assistantMessages = session.messages.filter((message) => message.role === "assistant" && !message.error);
  const allMessages = session.messages.filter((message) => !message.error);

  return {
    sessionId: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    keyFacts: pickUnique([
      ...userMessages.map((message) => sentenceSummary(message.content)),
      ...assistantMessages.flatMap(extractToolFacts)
    ]),
    decisions: pickUnique(allMessages.flatMap((message) => extractByKeywords(message.content, ["决定", "确认", "采用", "改为"]))),
    todos: pickUnique(allMessages.flatMap((message) => extractByKeywords(message.content, ["待办", "下一步", "需要", "TODO", "修复"]))),
    userPreferences: pickUnique(userMessages.flatMap((message) => extractByKeywords(message.content, ["我喜欢", "我希望", "不要", "优先", "偏好"])))
  };
}

export function renderSessionSummary(summary: SessionSummary): string {
  return [
    `# ${summary.title || summary.sessionId}`,
    "",
    `- 会话：${summary.sessionId}`,
    `- 创建：${summary.createdAt}`,
    `- 更新：${summary.updatedAt}`,
    "",
    "## 关键事实",
    renderList(summary.keyFacts),
    "",
    "## 决策",
    renderList(summary.decisions),
    "",
    "## 待办",
    renderList(summary.todos),
    "",
    "## 用户偏好",
    renderList(summary.userPreferences),
    ""
  ].join("\n");
}

function sentenceSummary(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 160);
}

function extractToolFacts(message: SessionMessage): string[] {
  return (message.tool_results ?? []).map((tool) => `${tool.name}: ${tool.result ?? JSON.stringify(tool.arguments)}`);
}

function extractByKeywords(content: string, keywords: string[]): string[] {
  return content
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter((item) => item && keywords.some((keyword) => item.includes(keyword)))
    .map((item) => item.slice(0, 180));
}

function pickUnique(items: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}
