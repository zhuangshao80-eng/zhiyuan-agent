import { DingTalkBridgeAdapter } from "./dingtalk.js";
import { FeishuBridgeAdapter } from "./feishu.js";
import { WeChatBridgeAdapter } from "./wechat.js";
import type { BridgeAdapter, BridgeAdapterConfig, BridgeEvent, BridgeMessage } from "./bridge-base.js";
import type { ChatStreamEvent, SendChatMessageRequest, SessionMessage } from "../../shared/types.js";
import type { SessionCoordinator } from "../../core/session-coordinator.js";

export interface BridgeSession {
  id: string;
  adapterId: string;
  conversationId: string;
  createdAt: string;
  messages: BridgeMessage[];
}

export interface BridgeAgentRouteResult {
  adapterId: string;
  conversationId: string;
  inbound: BridgeMessage;
  assistantMessage: SessionMessage;
  outbound: BridgeMessage;
  events: ChatStreamEvent[];
}

export class BridgeSessionManager {
  private readonly adapters = new Map<string, BridgeAdapter>();
  private readonly sessions = new Map<string, BridgeSession>();
  private readonly events: BridgeEvent[] = [];

  constructor(
    adapters: BridgeAdapter[] = [new FeishuBridgeAdapter(), new DingTalkBridgeAdapter(), new WeChatBridgeAdapter()]
  ) {
    adapters.forEach((adapter) => this.registerAdapter(adapter));
  }

  static withConfig(config: Partial<Record<"feishu" | "dingtalk" | "wechat", BridgeAdapterConfig>>): BridgeSessionManager {
    return new BridgeSessionManager([
      new FeishuBridgeAdapter(config.feishu),
      new DingTalkBridgeAdapter(config.dingtalk),
      new WeChatBridgeAdapter(config.wechat)
    ]);
  }

  registerAdapter(adapter: BridgeAdapter): void {
    this.adapters.set(adapter.id, adapter);
    adapter.subscribe((event) => this.events.push(event));
  }

  listAdapters(): Array<{ id: string; name: string; configured: boolean }> {
    return [...this.adapters.values()].map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      configured: Boolean(adapter.config.webhookUrl || adapter.config.appId)
    }));
  }

  createSession(adapterId: string, conversationId: string): BridgeSession {
    if (!this.adapters.has(adapterId)) throw new Error(`Bridge adapter not found: ${adapterId}`);
    const id = `${adapterId}_${conversationId}`;
    const session = this.sessions.get(id) ?? {
      id,
      adapterId,
      conversationId,
      createdAt: new Date().toISOString(),
      messages: []
    };
    this.sessions.set(id, session);
    return session;
  }

  async send(sessionId: string, content: string): Promise<BridgeMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Bridge session not found: ${sessionId}`);
    const adapter = this.adapters.get(session.adapterId);
    if (!adapter) throw new Error(`Bridge adapter not found: ${session.adapterId}`);
    const message = await adapter.sendMessage(session.conversationId, content);
    session.messages.push(message);
    return message;
  }

  async routeInboundToAgent(input: {
    adapterId: string;
    conversationId: string;
    sender: string;
    content: string;
    coordinator: SessionCoordinator;
    model: string;
    sessionId?: string;
  }): Promise<BridgeAgentRouteResult> {
    const session = this.createSession(input.adapterId, input.conversationId);
    const inbound: BridgeMessage = {
      id: `${input.adapterId}_in_${Date.now()}`,
      conversationId: input.conversationId,
      sender: input.sender,
      content: input.content,
      createdAt: new Date().toISOString(),
      transport: { mode: "webhook", attempted: false }
    };
    session.messages.push(inbound);
    this.events.push({ type: "message", adapter: input.adapterId, payload: inbound, createdAt: new Date().toISOString() });

    const events: ChatStreamEvent[] = [];
    const request: SendChatMessageRequest = {
      sessionId: input.sessionId,
      content: input.content,
      model: input.model
    };
    await input.coordinator.sendMessage(request, (event) => events.push(event));
    const done = await waitForDone(events);
    const outbound = await this.send(session.id, done.content || done.error || "Agent 没有生成回复。");

    return {
      adapterId: input.adapterId,
      conversationId: input.conversationId,
      inbound,
      assistantMessage: done,
      outbound,
      events
    };
  }

  listSessions(): BridgeSession[] {
    return [...this.sessions.values()];
  }

  listEvents(): BridgeEvent[] {
    return [...this.events];
  }
}

async function waitForDone(events: ChatStreamEvent[], timeoutMs = 3000): Promise<SessionMessage> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const done = events.find((event): event is Extract<ChatStreamEvent, { type: "done" }> => event.type === "done");
    if (done) {
      return done.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for Agent bridge response");
}
