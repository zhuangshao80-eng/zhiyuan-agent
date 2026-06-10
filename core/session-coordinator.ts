import fs from "node:fs/promises";
import path from "node:path";
import { LlmClient } from "./llm-client.js";
import { AuditLog } from "./security/audit-log.js";
import { SessionCompactor } from "./session-compactor.js";
import { SkillManager } from "./skill-manager.js";
import { estimateTokens, UsageLedger } from "./usage-ledger.js";
import { FactStore, type MemoryFactInput } from "../lib/memory/fact-store.js";
import { compileMemory } from "../lib/memory/memory-compiler.js";
import { createMemorySearchTool } from "../lib/memory/memory-search.js";
import { generateSessionSummary } from "../lib/memory/session-summary.js";
import { buildSystemPrompt } from "../lib/persona/system-prompt.js";
import { ProviderConfigStore } from "../lib/provider-config.js";
import { TOOL_DISCIPLINE_PROMPT } from "../lib/tools/tool-discipline.js";
import { runWebSearch, shouldRunWebSearch, webSearchToolDefinition } from "../lib/tools/web-search.js";
import type {
  ChatSession,
  ChatStreamEvent,
  LlmMessage,
  LlmToolCall,
  SendChatMessageRequest,
  SendChatMessageResult,
  SessionMessage,
  VisibleToolCall
} from "../shared/types.js";

export type ChatEventSink = (event: ChatStreamEvent) => void;

export interface SessionCoordinatorOptions {
  sessionsDir?: string;
  memoryDir?: string;
  agentDir?: string;
  productDir?: string;
  userDir?: string;
  memoryMasterEnabled?: boolean;
  memorySessionEnabled?: boolean;
  llmClient?: LlmClient;
  providerConfigStore?: ProviderConfigStore;
  factStore?: FactStore;
  skillManager?: SkillManager;
  auditLog?: AuditLog;
  usageLedger?: UsageLedger;
  sessionCompactor?: SessionCompactor;
  disabledTools?: string[];
  toolDisciplinePrompt?: string;
}

export class SessionCoordinator {
  private readonly sessionsDir: string;
  private readonly memoryDir: string;
  private readonly agentDir: string;
  private readonly productDir: string;
  private readonly userDir: string;
  private readonly llmClient: LlmClient;
  private readonly providerConfigStore: ProviderConfigStore;
  private readonly factStore: FactStore;
  private readonly skillManager: SkillManager;
  private readonly auditLog: AuditLog;
  private readonly usageLedger: UsageLedger;
  private readonly sessionCompactor: SessionCompactor;
  private readonly ownsFactStore: boolean;
  private readonly disabledTools: Set<string>;
  private readonly toolDisciplinePrompt: string;
  private memoryMasterEnabled: boolean;
  private memorySessionEnabled: boolean;

  constructor(options: SessionCoordinatorOptions = {}) {
    this.sessionsDir = options.sessionsDir ?? path.join(process.cwd(), "agents", "default", "sessions");
    this.memoryDir = options.memoryDir ?? path.join(process.cwd(), "agents", "default", "memory");
    this.agentDir = options.agentDir ?? path.dirname(this.memoryDir);
    this.productDir = options.productDir ?? process.cwd();
    this.userDir = options.userDir ?? "";
    this.llmClient = options.llmClient ?? new LlmClient();
    this.providerConfigStore = options.providerConfigStore ?? new ProviderConfigStore();
    this.factStore = options.factStore ?? new FactStore(path.join(this.memoryDir, "facts.db"));
    this.skillManager = options.skillManager ?? new SkillManager(path.join(this.agentDir, "skills"));
    this.auditLog = options.auditLog ?? new AuditLog(path.join(this.agentDir, "security", "audit-log.jsonl"));
    this.usageLedger = options.usageLedger ?? new UsageLedger(path.join(this.agentDir, "usage-ledger.jsonl"));
    this.sessionCompactor = options.sessionCompactor ?? new SessionCompactor();
    this.ownsFactStore = !options.factStore;
    this.disabledTools = new Set(options.disabledTools ?? []);
    this.toolDisciplinePrompt = options.toolDisciplinePrompt ?? TOOL_DISCIPLINE_PROMPT;
    this.memoryMasterEnabled = options.memoryMasterEnabled ?? true;
    this.memorySessionEnabled = options.memorySessionEnabled ?? true;
  }

  async create(model = "deepseek:deepseek-chat"): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: `session_${Date.now()}`,
      title: "新会话",
      model,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    await this.saveSession(session);
    return session;
  }

  async listSessions(): Promise<ChatSession[]> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.loadSession(entry.name.replace(/\.json$/, "")))
    );

    return sessions
      .filter((session): session is ChatSession => Boolean(session))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.loadSession(sessionId);
  }

  async sendMessage(request: SendChatMessageRequest, sink: ChatEventSink): Promise<SendChatMessageResult> {
    const session = request.sessionId
      ? (await this.loadSession(request.sessionId)) ?? (await this.create(request.model))
      : await this.create(request.model);
    const now = new Date().toISOString();
    const userMessage: SessionMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: request.content,
      createdAt: now,
      model: request.model
    };
    const assistantMessage: SessionMessage = {
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: "",
      createdAt: now,
      model: request.model,
      tool_calls: []
    };

    session.model = request.model;
    session.title = session.messages.length === 0 ? request.content.slice(0, 28) || "新会话" : session.title;
    session.messages.push(userMessage, assistantMessage);
    await this.saveSession(session);
    await this.auditLog.record({
      action: "chat.send",
      subject: "user",
      resource: session.id,
      outcome: "info",
      detail: `model=${request.model}`
    });

    void this.receiveResponse(session.id, assistantMessage.id, request, sink);

    return {
      sessionId: session.id,
      userMessage,
      assistantMessage
    };
  }

  async receiveResponse(
    sessionId: string,
    assistantMessageId: string,
    request: SendChatMessageRequest,
    sink: ChatEventSink
  ): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      sink({ type: "error", sessionId, messageId: assistantMessageId, error: `Session not found: ${sessionId}` });
      return;
    }

    const assistantMessage = session.messages.find((message) => message.id === assistantMessageId);
    if (!assistantMessage) {
      sink({ type: "error", sessionId, messageId: assistantMessageId, error: `Message not found: ${assistantMessageId}` });
      return;
    }

    try {
      const toolResults: VisibleToolCall[] = [];
      const executedToolSignatures = new Set<string>();
      if (await this.tryInvokeSkill(session, assistantMessage, request, sink)) {
        return;
      }

      const memoryToolCall = this.searchMemoryForRequest(request.content);
      if (memoryToolCall) {
        assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], {
          ...memoryToolCall,
          status: "running",
          result: undefined
        });
        sink({
          type: "tool_call",
          sessionId,
          messageId: assistantMessage.id,
          toolCall: { ...memoryToolCall, status: "running", result: undefined }
        });
        assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], memoryToolCall);
        assistantMessage.tool_results = upsertToolCall(assistantMessage.tool_results ?? [], memoryToolCall);
        sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: memoryToolCall });
        await this.saveSession(session);
      }

      if (this.isToolEnabled("web_search") && shouldRunWebSearch(request.content)) {
        const runningToolCall: VisibleToolCall = {
          id: `tool_${Date.now()}`,
          name: "web_search",
          arguments: { query: normalizeWebSearchQuery(request.content) },
          status: "running"
        };
        assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], runningToolCall);
        sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: runningToolCall });
        await this.saveSession(session);

        const completed = await runWebSearch(request.content);
        executedToolSignatures.add(getToolSignature(completed));
        toolResults.push(completed);
        assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], completed);
        assistantMessage.tool_results = upsertToolCall(assistantMessage.tool_results ?? [], completed);
        sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: completed });
      }

      const stream = await this.llmClient.chatCompletion({
        model: request.model,
        stream: true,
        config: await this.providerConfigStore.toResolverConfig(),
        messages: toLlmMessages(
          session.messages,
          toolResults,
          await this.buildRequestSystemPrompt(memoryToolCall ? [memoryToolCall] : [])
        ),
        tools: this.createLlmToolDefinitions()
      });

      let responseErrored = false;

      for await (const event of stream) {
        if (event.type === "token") {
          assistantMessage.content += event.token;
          sink({ type: "token", sessionId, messageId: assistantMessage.id, token: event.token });
        } else if (event.type === "reasoning") {
          assistantMessage.reasoning = `${assistantMessage.reasoning ?? ""}${event.token}`;
          sink({ type: "reasoning", sessionId, messageId: assistantMessage.id, token: event.token });
        } else if (event.type === "tool_call") {
          const visible = toVisibleToolCall(event.toolCall);
          if (executedToolSignatures.has(getToolSignature(visible))) {
            const deduped: VisibleToolCall = {
              ...visible,
              status: "completed",
              result: "已复用前置 web_search 结果，避免重复搜索。"
            };
            assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], deduped);
            sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: deduped });
          } else {
            assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], visible);
            sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: visible });
          }
        } else if (event.type === "error") {
          responseErrored = true;
          assistantMessage.error = event.error;
          assistantMessage.content = "";
          sink({ type: "error", sessionId, messageId: assistantMessage.id, error: event.error });
          break;
        }
      }

      if (responseErrored) {
        session.updatedAt = new Date().toISOString();
        await this.recordUsage(session.id, request.model, request.content, assistantMessage.content);
        await this.saveSession(session);
        sink({ type: "done", sessionId, messageId: assistantMessage.id, message: assistantMessage });
        return;
      }

      const modelRequestedToolResults = await executePendingToolCalls(
        assistantMessage.tool_calls ?? [],
        executedToolSignatures,
        this.factStore,
        this.disabledTools
      );
      for (const toolResult of modelRequestedToolResults) {
        toolResults.push(toolResult);
        assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], toolResult);
        assistantMessage.tool_results = upsertToolCall(assistantMessage.tool_results ?? [], toolResult);
        sink({ type: "tool_call", sessionId, messageId: assistantMessage.id, toolCall: toolResult });
      }

      if (!assistantMessage.content && toolResults.length > 0) {
        assistantMessage.content = `工具调用完成：\n${toolResults.map((tool) => tool.result).join("\n")}`;
      }

      session.updatedAt = new Date().toISOString();
      await this.recordUsage(session.id, request.model, request.content, assistantMessage.content);
      const compaction = await this.compactIfNeeded(session);
      if (compaction.compacted) {
        await this.auditLog.record({
          action: "session.compact",
          subject: "system",
          resource: session.id,
          outcome: "info",
          detail: `${compaction.originalMessageCount}->${compaction.nextMessageCount}, tools=${compaction.preservedToolResults}`
        });
      }
      await this.saveSession(session);
      await this.maintainMemory(session);
      sink({ type: "done", sessionId, messageId: assistantMessage.id, message: assistantMessage });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sink({ type: "error", sessionId, messageId: assistantMessage.id, error: message });
      assistantMessage.error = message;
      assistantMessage.content = "";
      await this.auditLog.record({
        action: "chat.error",
        subject: "system",
        resource: session.id,
        outcome: "denied",
        detail: message
      });
      await this.saveSession(session);
    }
  }

  async destroy(sessionId: string): Promise<void> {
    await fs.rm(this.sessionPath(sessionId), { force: true });
  }

  async rename(sessionId: string, title: string): Promise<ChatSession | null> {
    const session = await this.loadSession(sessionId);
    if (!session) return null;
    session.title = title.trim() || session.title;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    return session;
  }

  async export(sessionId: string, outputDir = path.join(process.cwd(), "artifacts")): Promise<{ sessionId: string; path: string }> {
    const session = await this.loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${sessionId}-session-export.json`);
    await fs.writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    return { sessionId, path: filePath };
  }

  dispose(): void {
    if (this.ownsFactStore) {
      this.factStore.close();
    }
  }

  setMemoryEnabled(masterEnabled: boolean, sessionEnabled = this.memorySessionEnabled): void {
    this.memoryMasterEnabled = masterEnabled;
    this.memorySessionEnabled = sessionEnabled;
  }

  setDisabledTools(names: string[]): void {
    this.disabledTools.clear();
    names.forEach((name) => this.disabledTools.add(name));
  }

  async clear(sessionId: string): Promise<ChatSession | null> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return null;
    }

    session.messages = [];
    session.title = "新会话";
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    return session;
  }

  private async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      return JSON.parse(await fs.readFile(this.sessionPath(sessionId), "utf8")) as ChatSession;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  private async saveSession(session: ChatSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.writeFile(this.sessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  private isMemoryEnabled(): boolean {
    return this.memoryMasterEnabled && this.memorySessionEnabled;
  }

  private isToolEnabled(name: string): boolean {
    return !this.disabledTools.has(name);
  }

  private createLlmToolDefinitions(): Array<{ type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } }> {
    const tools = [];
    if (this.isToolEnabled("web_search")) {
      tools.push(webSearchToolDefinition);
    }

    if (this.isToolEnabled("memory_search") && this.isMemoryEnabled()) {
      tools.push(createMemorySearchTool(this.factStore).definition);
    }

    return tools;
  }

  private async maintainMemory(session: ChatSession): Promise<void> {
    if (!this.isMemoryEnabled()) {
      return;
    }

    const facts = extractFactsFromSession(session);
    if (facts.length > 0) {
      this.factStore.addBatch(facts);
    }

    await generateSessionSummary(session, this.memoryDir);
    await compileMemory({ memoryDir: this.memoryDir, factStore: this.factStore });
  }

  private searchMemoryForRequest(content: string): VisibleToolCall | null {
    if (!this.isMemoryEnabled() || !this.isToolEnabled("memory_search")) {
      return null;
    }

    const started = Date.now();
    const results = this.factStore.search({ keyword: content, limit: 5 });
    const elapsedMs = Date.now() - started;
    if (results.length === 0) {
      return null;
    }

    return {
      id: `tool_memory_${Date.now()}`,
      name: "memory_search",
      arguments: { keyword: content, limit: 5 },
      status: "completed",
      result: [`命中 ${results.length} 条相关记忆（${elapsedMs}ms）：`, ...results.map((fact) => `- ${fact.fact}`)].join("\n")
    };
  }

  private async buildRequestSystemPrompt(memoryResults: VisibleToolCall[]): Promise<string> {
    const memorySearchContext = memoryResults
      .map((tool) => tool.result ?? "")
      .filter(Boolean)
      .join("\n\n");

    try {
      return (
        await buildSystemPrompt({
          agentDir: this.agentDir,
          productDir: this.productDir,
          userDir: this.userDir,
          toolDisciplinePrompt: this.toolDisciplinePrompt,
          memorySearchContext
        })
      ).prompt;
    } catch {
      return [this.toolDisciplinePrompt, memorySearchContext].filter(Boolean).join("\n\n");
    }
  }

  private async tryInvokeSkill(
    session: ChatSession,
    assistantMessage: SessionMessage,
    request: SendChatMessageRequest,
    sink: ChatEventSink
  ): Promise<boolean> {
    const invocation = parseSkillInvocation(request.content);
    if (!invocation) {
      return false;
    }

    await this.skillManager.loadInstalled();
    const skill = this.skillManager.get(invocation.name);
    if (!skill) {
      const errorMessage = `技能 ${invocation.name} 未安装或不可用。`;
      const failed: VisibleToolCall = {
        id: `tool_skill_${Date.now()}`,
        name: "skill_call",
        arguments: { skill: invocation.name, input: invocation.input },
        status: "failed",
        result: errorMessage
      };
      assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], failed);
      assistantMessage.tool_results = upsertToolCall(assistantMessage.tool_results ?? [], failed);
      assistantMessage.error = failed.result;
      sink({ type: "tool_call", sessionId: session.id, messageId: assistantMessage.id, toolCall: failed });
      sink({ type: "error", sessionId: session.id, messageId: assistantMessage.id, error: errorMessage });
      await this.saveSession(session);
      sink({ type: "done", sessionId: session.id, messageId: assistantMessage.id, message: assistantMessage });
      return true;
    }

    const running: VisibleToolCall = {
      id: `tool_skill_${Date.now()}`,
      name: "skill_call",
      arguments: { skill: skill.name, input: invocation.input },
      status: "running"
    };
    assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], running);
    sink({ type: "tool_call", sessionId: session.id, messageId: assistantMessage.id, toolCall: running });
    await this.saveSession(session);

    const result = this.skillManager.execute(skill.name, invocation.input);
    const completed: VisibleToolCall = {
      ...running,
      status: "completed",
      result: result.output
    };
    assistantMessage.content = result.output;
    assistantMessage.tool_calls = upsertToolCall(assistantMessage.tool_calls ?? [], completed);
    assistantMessage.tool_results = upsertToolCall(assistantMessage.tool_results ?? [], completed);
    session.updatedAt = new Date().toISOString();
    sink({ type: "tool_call", sessionId: session.id, messageId: assistantMessage.id, toolCall: completed });
    await this.recordUsage(session.id, request.model, request.content, assistantMessage.content);
    const compaction = await this.compactIfNeeded(session);
    await this.auditLog.record({
      action: "skill.invoke",
      subject: "user",
      resource: session.id,
      outcome: "allowed",
      detail: `${skill.name}${compaction.compacted ? " compacted" : ""}`
    });
    await this.saveSession(session);
    await this.maintainMemory(session);
    sink({ type: "done", sessionId: session.id, messageId: assistantMessage.id, message: assistantMessage });
    return true;
  }

  private async recordUsage(sessionId: string, model: string, input: string, output: string): Promise<void> {
    await this.usageLedger.record({
      sessionId,
      model,
      inputTokens: estimateTokens(input),
      outputTokens: estimateTokens(output)
    });
  }

  private async compactIfNeeded(session: ChatSession) {
    const result = this.sessionCompactor.compact(session);
    if (result.compacted) {
      session.messages = result.session.messages;
      session.updatedAt = result.session.updatedAt;
    }
    return result;
  }
}

function parseSkillInvocation(content: string): { name: string; input: string } | null {
  const text = content.trim();
  const match =
    text.match(/^(?:使用|调用|执行)?技能[:：\s]+([a-zA-Z0-9_-]+)\s*[:：-]?\s*([\s\S]*)$/) ??
    text.match(/^\/skill\s+([a-zA-Z0-9_-]+)\s*([\s\S]*)$/i);
  if (!match) {
    return null;
  }

  return {
    name: match[1].trim().toLowerCase(),
    input: (match[2] ?? "").trim() || text
  };
}

function extractFactsFromSession(session: ChatSession): MemoryFactInput[] {
  const facts: MemoryFactInput[] = [];
  session.messages.forEach((message, index) => {
    if (message.error) {
      return;
    }

    if (message.role === "user" && message.content.trim()) {
      facts.push({
        id: `fact_${session.id}_${message.id}_user`,
        fact: `用户提到：${message.content.trim().slice(0, 220)}`,
        tags: inferFactTags(message.content, ["user"]),
        time: message.createdAt,
        sessionId: session.id
      });
    }

    for (const tool of message.tool_results ?? []) {
      if (tool.name === "memory_search") {
        continue;
      }

      facts.push({
        id: `fact_${session.id}_${message.id}_tool_${index}`,
        fact: `工具 ${tool.name} 返回：${tool.result ?? JSON.stringify(tool.arguments)}`.slice(0, 500),
        tags: ["tool", tool.name],
        time: message.createdAt,
        sessionId: session.id
      });
    }
  });

  return facts;
}

function inferFactTags(content: string, baseTags: string[]): string[] {
  const tags = [...baseTags];
  if (/我喜欢|我希望|不要|优先|偏好/.test(content)) {
    tags.push("preference");
  }
  if (/决定|确认|采用|改为/.test(content)) {
    tags.push("decision");
  }
  if (/待办|下一步|需要|TODO|修复/.test(content)) {
    tags.push("todo");
  }
  if (/重要|必须|关键/.test(content)) {
    tags.push("important");
  }

  return [...new Set(tags)];
}

function toLlmMessages(
  messages: SessionMessage[],
  toolResults: VisibleToolCall[],
  systemPrompt: string
): LlmMessage[] {
  const llmMessages: LlmMessage[] = messages
    .filter((message) => message.role === "system" || message.role === "user" || (message.role === "assistant" && message.content))
    .map((message) => ({
      role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
      content: message.content
    }));

  llmMessages.unshift({
    role: "system",
    content: systemPrompt
  });

  if (toolResults.length > 0) {
    llmMessages.push({
      role: "user",
      content: `以下是已执行工具结果，请结合结果回答用户，不要再次调用同一工具：\n${toolResults
        .map((tool) => `[${tool.name}] 参数：${JSON.stringify(tool.arguments)}\n结果：${tool.result ?? ""}`)
        .join("\n\n")}`
    });
  }

  return llmMessages;
}

function toVisibleToolCall(toolCall: LlmToolCall): VisibleToolCall {
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: safeParseArguments(toolCall.function.arguments),
    status: "running"
  };
}

function safeParseArguments(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function upsertToolCall(toolCalls: VisibleToolCall[], toolCall: VisibleToolCall): VisibleToolCall[] {
  const index = toolCalls.findIndex((item) => item.id === toolCall.id);
  if (index === -1) {
    return [...toolCalls, toolCall];
  }

  return toolCalls.map((item, itemIndex) => (itemIndex === index ? toolCall : item));
}

async function executePendingToolCalls(
  toolCalls: VisibleToolCall[],
  executedToolSignatures = new Set<string>(),
  factStore?: FactStore,
  disabledTools = new Set<string>()
): Promise<VisibleToolCall[]> {
  const results: VisibleToolCall[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.status === "completed") {
      continue;
    }

    if (disabledTools.has(toolCall.name)) {
      results.push({
        ...toolCall,
        status: "failed",
        result: `工具 ${toolCall.name} 已被配置禁用。`
      });
      continue;
    }

    if (toolCall.name === "memory_search" && factStore) {
      const keyword = typeof toolCall.arguments.keyword === "string" ? toolCall.arguments.keyword : "";
      const tags = Array.isArray(toolCall.arguments.tags) ? toolCall.arguments.tags.map(String) : undefined;
      const limit = typeof toolCall.arguments.limit === "number" ? toolCall.arguments.limit : 5;
      const started = Date.now();
      const facts = factStore.search({ keyword, tags, limit });
      results.push({
        ...toolCall,
        status: "completed",
        result: [`命中 ${facts.length} 条相关记忆（${Date.now() - started}ms）：`, ...facts.map((fact) => `- ${fact.fact}`)].join("\n")
      });
      continue;
    }

    if (toolCall.name !== "web_search") {
      continue;
    }

    const signature = getToolSignature(toolCall);
    if (executedToolSignatures.has(signature)) {
      results.push({
        ...toolCall,
        status: "completed",
        result: "已复用前置 web_search 结果，避免重复搜索。"
      });
      continue;
    }

    const query = typeof toolCall.arguments.query === "string" ? toolCall.arguments.query : JSON.stringify(toolCall.arguments);
    const result = await runWebSearch(query);
    executedToolSignatures.add(signature);
    results.push({
      ...toolCall,
      status: "completed",
      result: result.result
    });
  }

  return results;
}

function getToolSignature(toolCall: VisibleToolCall): string {
  const query = typeof toolCall.arguments.query === "string" ? normalizeWebSearchQuery(toolCall.arguments.query) : "";
  return `${toolCall.name}:${query}`;
}

function normalizeWebSearchQuery(query: string): string {
  return query.replace(/\bweb-search\b|\bweb_search\b|搜索|查一下|联网/g, "").trim() || query;
}
