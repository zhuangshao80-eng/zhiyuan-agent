import type { ChatSession, SessionMessage, VisibleToolCall } from "../shared/types.js";
import { estimateTokens } from "./usage-ledger.js";

export interface SessionCompactorOptions {
  maxMessages?: number;
  maxTokens?: number;
  keepRecent?: number;
}

export interface CompactionResult {
  compacted: boolean;
  session: ChatSession;
  originalMessageCount: number;
  nextMessageCount: number;
  summary?: string;
  preservedToolResults: number;
}

export class SessionCompactor {
  private readonly maxMessages: number;
  private readonly maxTokens: number;
  private readonly keepRecent: number;

  constructor(options: SessionCompactorOptions = {}) {
    this.maxMessages = options.maxMessages ?? 24;
    this.maxTokens = options.maxTokens ?? 2400;
    this.keepRecent = options.keepRecent ?? 8;
  }

  shouldCompact(session: ChatSession): boolean {
    return session.messages.length > this.maxMessages || estimateSessionTokens(session) > this.maxTokens;
  }

  compact(session: ChatSession): CompactionResult {
    const originalMessageCount = session.messages.length;
    if (!this.shouldCompact(session)) {
      return {
        compacted: false,
        session,
        originalMessageCount,
        nextMessageCount: originalMessageCount,
        preservedToolResults: countToolResults(session.messages)
      };
    }

    const recent = session.messages.slice(-this.keepRecent);
    const history = session.messages.slice(0, -this.keepRecent);
    const preservedTools = history.flatMap((message) => message.tool_results ?? []);
    const summary = buildHistorySummary(history, preservedTools);
    const summaryMessage: SessionMessage = {
      id: `summary_${Date.now()}`,
      role: "system",
      content: summary,
      createdAt: new Date().toISOString(),
      tool_results: preservedTools
    };
    const next: ChatSession = {
      ...session,
      messages: [summaryMessage, ...recent],
      updatedAt: new Date().toISOString()
    };

    return {
      compacted: true,
      session: next,
      originalMessageCount,
      nextMessageCount: next.messages.length,
      summary,
      preservedToolResults: preservedTools.length
    };
  }
}

export function estimateSessionTokens(session: ChatSession): number {
  return session.messages.reduce((total, message) => total + estimateTokens(message.content) + estimateTokens(message.reasoning ?? ""), 0);
}

function buildHistorySummary(messages: SessionMessage[], toolResults: VisibleToolCall[]): string {
  const facts = messages
    .filter((message) => message.content.trim())
    .slice(-12)
    .map((message) => `- ${message.role}: ${message.content.trim().slice(0, 180)}`)
    .join("\n");
  const tools = toolResults
    .slice(-8)
    .map((tool) => `- ${tool.name}: ${String(tool.result ?? "").slice(0, 180)}`)
    .join("\n");
  return [`已压缩历史会话。以下摘要用于无缝继续对话：`, facts, tools ? `保留的工具结果：\n${tools}` : ""].filter(Boolean).join("\n");
}

function countToolResults(messages: SessionMessage[]): number {
  return messages.reduce((total, message) => total + (message.tool_results?.length ?? 0), 0);
}
