import { BridgeAdapter, type BridgeMessage } from "./bridge-base.js";

export class WeChatBridgeAdapter extends BridgeAdapter {
  readonly id = "wechat";
  readonly name = "企业微信";

  async sendMessage(conversationId: string, content: string): Promise<BridgeMessage> {
    if (!this.connected) await this.connect();
    const message = this.createMessage(conversationId, "wechat-bot", content);
    this.emit("message", message);
    return message;
  }
}
