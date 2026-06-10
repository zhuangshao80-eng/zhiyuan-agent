import { createHmac } from "node:crypto";
import { BridgeAdapter, type BridgeAdapterConfig, type BridgeMessage } from "./bridge-base.js";

export interface FeishuInboundEvent {
  challenge?: string;
  event?: {
    message?: {
      chat_id?: string;
      content?: string;
      message_id?: string;
    };
    sender?: {
      sender_id?: {
        open_id?: string;
      };
    };
  };
}

export class FeishuBridgeAdapter extends BridgeAdapter {
  readonly id = "feishu";
  readonly name = "飞书";

  constructor(config: BridgeAdapterConfig = {}) {
    super(config);
  }

  hasBotCredentials(): boolean {
    return Boolean(this.config.webhookUrl || (this.config.appId && this.config.appSecret));
  }

  async sendMessage(conversationId: string, content: string): Promise<BridgeMessage> {
    if (!this.connected) await this.connect();
    const transport = await this.sendWebhook(content);
    const message = this.createMessage(conversationId, "feishu-bot", content, transport);
    this.emit("message", message);
    return message;
  }

  parseInboundEvent(body: FeishuInboundEvent): BridgeMessage | { challenge: string } | null {
    if (body.challenge) {
      return { challenge: body.challenge };
    }

    const message = body.event?.message;
    if (!message?.chat_id) {
      return null;
    }

    return this.createMessage(
      message.chat_id,
      body.event?.sender?.sender_id?.open_id ?? "feishu-user",
      parseFeishuText(message.content),
      { mode: "webhook", attempted: false }
    );
  }

  createSignature(timestamp: string, nonce = ""): string | undefined {
    if (!this.config.signingSecret) {
      return undefined;
    }

    return createHmac("sha256", `${timestamp}\n${nonce}`, { encoding: "utf8" }).update(this.config.signingSecret).digest("base64");
  }

  private async sendWebhook(content: string): Promise<BridgeMessage["transport"]> {
    if (!this.config.webhookUrl) {
      return { mode: "local", attempted: false, ok: true };
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msg_type: "text", content: { text: content } })
      });
      return { mode: "webhook", attempted: true, ok: response.ok, status: response.status };
    } catch (error) {
      return { mode: "webhook", attempted: true, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function parseFeishuText(content?: string): string {
  if (!content) return "";
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? content;
  } catch {
    return content;
  }
}
