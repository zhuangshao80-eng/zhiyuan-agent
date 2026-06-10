import { createHmac } from "node:crypto";
import { BridgeAdapter, type BridgeAdapterConfig, type BridgeMessage } from "./bridge-base.js";

export interface DingTalkInboundEvent {
  conversationId?: string;
  conversationTitle?: string;
  senderStaffId?: string;
  text?: {
    content?: string;
  };
}

export class DingTalkBridgeAdapter extends BridgeAdapter {
  readonly id = "dingtalk";
  readonly name = "钉钉";

  constructor(config: BridgeAdapterConfig = {}) {
    super(config);
  }

  async sendMessage(conversationId: string, content: string): Promise<BridgeMessage> {
    if (!this.connected) await this.connect();
    const transport = await this.sendWebhook(content);
    const message = this.createMessage(conversationId, "dingtalk-bot", content, transport);
    this.emit("message", message);
    return message;
  }

  parseInboundEvent(body: DingTalkInboundEvent): BridgeMessage | null {
    if (!body.conversationId) {
      return null;
    }

    return this.createMessage(body.conversationId, body.senderStaffId ?? "dingtalk-user", body.text?.content ?? "", {
      mode: "webhook",
      attempted: false
    });
  }

  createSignedWebhookUrl(timestamp = Date.now()): string | undefined {
    if (!this.config.webhookUrl) {
      return undefined;
    }
    if (!this.config.signingSecret) {
      return this.config.webhookUrl;
    }

    const signature = createHmac("sha256", this.config.signingSecret).update(`${timestamp}\n${this.config.signingSecret}`).digest("base64");
    const url = new URL(this.config.webhookUrl);
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("sign", signature);
    return url.toString();
  }

  private async sendWebhook(content: string): Promise<BridgeMessage["transport"]> {
    const webhookUrl = this.createSignedWebhookUrl();
    if (!webhookUrl) {
      return { mode: "local", attempted: false, ok: true };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msgtype: "text", text: { content } })
      });
      return { mode: "webhook", attempted: true, ok: response.ok, status: response.status };
    } catch (error) {
      return { mode: "webhook", attempted: true, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
