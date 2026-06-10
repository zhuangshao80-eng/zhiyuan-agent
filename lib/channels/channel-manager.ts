import fs from "node:fs/promises";
import path from "node:path";
import type { Channel, ChannelMember, ChannelMessage } from "../../shared/types.js";

export class ChannelManager {
  private readonly channelsPath: string;
  private readonly messagesDir: string;

  constructor(private readonly agentDir: string) {
    const channelsDir = path.join(agentDir, "desk", "channels");
    this.channelsPath = path.join(channelsDir, "channels.json");
    this.messagesDir = path.join(channelsDir, "messages");
  }

  async listChannels(): Promise<Channel[]> {
    await this.ensure();
    return readJson<Channel[]>(this.channelsPath, []);
  }

  async createChannel(input: { name: string; topic?: string; dm?: boolean; members?: ChannelMember[] }): Promise<Channel> {
    const channels = await this.listChannels();
    const now = new Date().toISOString();
    const channel: Channel = {
      id: `${input.dm ? "dm" : "channel"}_${Date.now()}`,
      name: input.name.trim(),
      topic: input.topic,
      members: input.members ?? [{ id: "user", name: "用户", role: "owner" }],
      createdAt: now,
      updatedAt: now,
      dm: input.dm
    };
    channels.push(channel);
    await this.saveChannels(channels);
    return channel;
  }

  async updateChannel(id: string, patch: Partial<Pick<Channel, "name" | "topic" | "members">>): Promise<Channel> {
    const channels = await this.listChannels();
    const index = channels.findIndex((channel) => channel.id === id);
    if (index === -1) throw new Error(`Channel not found: ${id}`);
    channels[index] = { ...channels[index], ...patch, updatedAt: new Date().toISOString() };
    await this.saveChannels(channels);
    return channels[index];
  }

  async deleteChannel(id: string): Promise<{ deleted: boolean }> {
    const channels = await this.listChannels();
    await this.saveChannels(channels.filter((channel) => channel.id !== id));
    await fs.rm(path.join(this.messagesDir, `${safeName(id)}.json`), { force: true });
    return { deleted: channels.some((channel) => channel.id === id) };
  }

  async listMessages(channelId: string): Promise<ChannelMessage[]> {
    await this.ensure();
    return readJson<ChannelMessage[]>(this.messagePath(channelId), []);
  }

  async postMessage(channelId: string, content: string, author = "用户"): Promise<ChannelMessage> {
    const messages = await this.listMessages(channelId);
    const message: ChannelMessage = {
      id: `msg_${Date.now()}`,
      channelId,
      author,
      content,
      createdAt: new Date().toISOString(),
      dm: channelId.startsWith("dm_")
    };
    messages.push(message);
    await fs.writeFile(this.messagePath(channelId), `${JSON.stringify(messages, null, 2)}\n`, "utf8");
    return message;
  }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.messagesDir, { recursive: true });
    try {
      await fs.access(this.channelsPath);
    } catch {
      await fs.writeFile(this.channelsPath, "[]\n", "utf8");
    }
  }

  private async saveChannels(channels: Channel[]): Promise<void> {
    await this.ensure();
    await fs.writeFile(this.channelsPath, `${JSON.stringify(channels, null, 2)}\n`, "utf8");
  }

  private messagePath(channelId: string): string {
    return path.join(this.messagesDir, `${safeName(channelId)}.json`);
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
