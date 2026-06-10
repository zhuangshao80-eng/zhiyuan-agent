export interface BridgeMessage {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  createdAt: string;
  transport?: {
    mode: "local" | "webhook";
    attempted: boolean;
    ok?: boolean;
    status?: number;
    error?: string;
  };
}

export interface BridgeAdapterConfig {
  webhookUrl?: string;
  signingSecret?: string;
  appId?: string;
  appSecret?: string;
  botId?: string;
}

export interface BridgeEvent {
  type: "message" | "connected" | "disconnected";
  adapter: string;
  payload: unknown;
  createdAt: string;
}

export type BridgeEventHandler = (event: BridgeEvent) => void;

export abstract class BridgeAdapter {
  private readonly handlers = new Set<BridgeEventHandler>();
  protected connected = false;

  abstract readonly id: string;
  abstract readonly name: string;
  readonly config: BridgeAdapterConfig;

  constructor(config: BridgeAdapterConfig = {}) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit("connected", { id: this.id });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit("disconnected", { id: this.id });
  }

  subscribe(handler: BridgeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  abstract sendMessage(conversationId: string, content: string): Promise<BridgeMessage>;

  protected emit(type: BridgeEvent["type"], payload: unknown): void {
    const event: BridgeEvent = { type, adapter: this.id, payload, createdAt: new Date().toISOString() };
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  protected createMessage(conversationId: string, sender: string, content: string, transport?: BridgeMessage["transport"]): BridgeMessage {
    return {
      id: `${this.id}_msg_${Date.now()}`,
      conversationId,
      sender,
      content,
      createdAt: new Date().toISOString(),
      transport
    };
  }
}
