import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

export interface SubAgentMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface SubAgentSession {
  threadId: string;
  parentSessionId?: string;
  label?: string;
  agent?: string;
  access: string;
  cwd?: string;
  createdAt: string;
  updatedAt: string;
  closed: boolean;
  messages: SubAgentMessage[];
}

interface SubAgentThread {
  session: SubAgentSession;
  sessionPath: string;
  queue: Promise<unknown>;
}

const threads = new Map<string, SubAgentThread>();

export const subagentTool: ToolDefinition<
  { prompt: string; agent?: string; label?: string; access?: string },
  { threadId: string; sessionPath: string; access: string; queued: boolean; reply: string }
> = {
  name: "subagent",
  description: "创建隔离的子代理实例，继承 cwd 和权限描述，返回 threadId。",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      agent: { type: "string" },
      label: { type: "string" },
      access: { type: "string" }
    },
    required: ["prompt"]
  },
  async execute(args, context) {
    if (!context?.agentDir) {
      throw new Error("subagent requires agentDir");
    }

    const threadId = `subagent_${Date.now()}_${threads.size + 1}`;
    const sessionPath = subagentSessionPath(context.agentDir, threadId);
    const now = new Date().toISOString();
    const session: SubAgentSession = {
      threadId,
      parentSessionId: context.parentSessionId,
      label: args.label,
      agent: args.agent,
      access: resolveAccess(context.access, args.access),
      cwd: context.cwd,
      createdAt: now,
      updatedAt: now,
      closed: false,
      messages: []
    };
    const thread: SubAgentThread = { session, sessionPath, queue: Promise.resolve() };
    threads.set(threadId, thread);
    const reply = await enqueue(thread, args.prompt);
    return { threadId, sessionPath, access: session.access, queued: false, reply };
  }
};

export const subagentReplyTool: ToolDefinition<
  { threadId: string; task: string },
  { threadId: string; sessionPath: string; access: string; queued: true; reply: string; messageCount: number }
> = {
  name: "subagent_reply",
  description: "续接同一 SubAgent 实例；同一实例忙时会排队执行。",
  parameters: {
    type: "object",
    properties: {
      threadId: { type: "string" },
      task: { type: "string" }
    },
    required: ["threadId", "task"]
  },
  async execute({ threadId, task }, context) {
    const thread = await getThread(threadId, context);
    const reply = await enqueue(thread, task);
    return {
      threadId,
      sessionPath: thread.sessionPath,
      access: thread.session.access,
      queued: true,
      reply,
      messageCount: thread.session.messages.length
    };
  }
};

export const subagentCloseTool: ToolDefinition<{ threadId: string }, { threadId: string; sessionPath: string; closed: boolean }> = {
  name: "subagent_close",
  description: "关闭 SubAgent 实例并释放后续队列。",
  parameters: {
    type: "object",
    properties: { threadId: { type: "string" } },
    required: ["threadId"]
  },
  async execute({ threadId }, context) {
    const thread = await getThread(threadId, context);
    thread.session.closed = true;
    thread.session.updatedAt = new Date().toISOString();
    await saveSession(thread);
    return { threadId, sessionPath: thread.sessionPath, closed: true };
  }
};

export function listSubAgents(): Array<{
  id: string;
  threadId: string;
  closed: boolean;
  label?: string;
  access: string;
  cwd?: string;
  sessionPath: string;
  messageCount: number;
}> {
  return [...threads.values()].map((thread) => ({
    id: thread.session.threadId,
    threadId: thread.session.threadId,
    closed: thread.session.closed,
    label: thread.session.label,
    access: thread.session.access,
    cwd: thread.session.cwd,
    sessionPath: thread.sessionPath,
    messageCount: thread.session.messages.length
  }));
}

async function enqueue(thread: SubAgentThread, task: string): Promise<string> {
  if (thread.session.closed) throw new Error(`SubAgent closed: ${thread.session.threadId}`);
  const run = thread.queue.then(async () => {
    const now = new Date().toISOString();
    thread.session.messages.push({ role: "user", content: task, createdAt: now });
    const reply = `SubAgent ${thread.session.label ?? thread.session.threadId} 已接收任务：${task}`;
    thread.session.messages.push({ role: "assistant", content: reply, createdAt: new Date().toISOString() });
    thread.session.updatedAt = new Date().toISOString();
    await saveSession(thread);
    return reply;
  });
  thread.queue = run.catch(() => undefined);
  return run;
}

async function getThread(threadId: string, context?: ToolExecutionContext): Promise<SubAgentThread> {
  const existing = threads.get(threadId);
  if (existing) return existing;
  if (!context?.agentDir) throw new Error(`SubAgent not found: ${threadId}`);

  const sessionPath = subagentSessionPath(context.agentDir, threadId);
  try {
    const session = JSON.parse(await fs.readFile(sessionPath, "utf8")) as SubAgentSession;
    const thread: SubAgentThread = { session, sessionPath, queue: Promise.resolve() };
    threads.set(threadId, thread);
    return thread;
  } catch {
    throw new Error(`SubAgent not found: ${threadId}`);
  }
}

async function saveSession(thread: SubAgentThread): Promise<void> {
  await fs.mkdir(path.dirname(thread.sessionPath), { recursive: true });
  await fs.writeFile(thread.sessionPath, `${JSON.stringify(thread.session, null, 2)}\n`, "utf8");
}

function subagentSessionPath(agentDir: string, threadId: string): string {
  return path.join(agentDir, "sessions", "subagents", `${safeThreadId(threadId)}.json`);
}

function safeThreadId(threadId: string): string {
  return threadId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resolveAccess(parentAccess?: string, requestedAccess?: string): string {
  const parent = normalizeAccess(parentAccess);
  const requested = normalizeAccess(requestedAccess);
  if (parent === "readonly" && requested !== "readonly") {
    return "readonly";
  }
  return requested ?? parent ?? "default";
}

function normalizeAccess(value?: string): string | undefined {
  if (!value) return undefined;
  if (["readonly", "read", "ro"].includes(value)) return "readonly";
  if (["write", "readwrite", "rw"].includes(value)) return "write";
  if (["full", "admin"].includes(value)) return "full";
  return value;
}

export function subagentContext(context?: ToolExecutionContext): { cwd?: string; access?: string; parentSessionId?: string } {
  return { cwd: context?.cwd, access: context?.access, parentSessionId: context?.parentSessionId };
}
