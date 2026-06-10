export type EngineStatus = "idle" | "initializing" | "ready" | "started" | "disposed";
export type AgentStatus = "idle" | "initializing" | "ready" | "disposed";

export interface CoreEvent {
  type: string;
  timestamp: string;
  payload?: unknown;
}

export type CoreEventHandler = (event: CoreEvent) => void;

export interface AgentCallbacks {
  emitEvent?: (event: CoreEvent) => void;
  resolveModel?: (modelRef: string) => Promise<ResolvedModel>;
}

export interface AgentConstructorOptions {
  id: string;
  agentsDir: string;
  productDir: string;
  userDir: string;
  cb?: AgentCallbacks;
}

export interface AgentPaths {
  agentDir: string;
  configPath: string;
  identityPath: string;
  ishikiPath: string;
  memoryDir: string;
  sessionDir: string;
  deskDir: string;
}

export interface AgentConfig {
  agent: {
    name: string;
    yuan: string;
  };
  user: {
    name: string;
  };
  locale: string;
  models: {
    chat: string;
    utility: string;
    utility_large: string;
  };
  memory: {
    enabled: boolean;
  };
  tools: {
    disabled: string[];
  };
  desk: {
    cron_auto_approve: boolean;
  };
}

export interface AgentIdentity {
  id: string;
  name: string;
  yuan: string;
  identityText: string;
  ishikiText: string;
}

export interface AgentInitState {
  configLoaded: boolean;
  identityLoaded: boolean;
  memoryReady: boolean;
  toolsReady: boolean;
  promptReady: boolean;
}

export type ProviderAuthType = "apikey" | "oauth";
export type ProviderCompatLayer = "openai" | "zhipu" | "qwen" | "deepseek" | "baidu" | "moonshot";

export interface ProviderDescriptor {
  id: string;
  name: string;
  authType: ProviderAuthType;
  compatLayer: ProviderCompatLayer;
  baseURL: string;
  envKey?: string;
  enabled?: boolean;
}

export interface ModelResolverConfig {
  providers?: Record<string, { apiKey?: string; baseURL?: string; accessToken?: string }>;
}

export interface ResolvedModel {
  provider: ProviderDescriptor;
  model: string;
  apiKey?: string;
  baseURL: string;
  resolvedAt: string;
}

export interface AgentManagerOptions {
  agentsDir: string;
  productDir: string;
  userDir: string;
  cb?: AgentCallbacks;
}

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  stream?: boolean;
  config?: ModelResolverConfig;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  model: string;
  content: string;
  reasoningContent?: string;
  toolCalls: LlmToolCall[];
  raw?: unknown;
}

export type LlmStreamEvent =
  | { type: "token"; token: string }
  | { type: "reasoning"; token: string }
  | { type: "tool_call"; toolCall: LlmToolCall }
  | { type: "done"; result: ChatCompletionResult }
  | { type: "error"; error: string };

export interface ProviderRequestPayload {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ProviderCompat {
  readonly compatLayer: ProviderCompatLayer;
  readonly defaultBaseURL: string;
  buildURL(resolved: ResolvedModel): string;
  buildHeaders(resolved: ResolvedModel): Record<string, string>;
  buildPayload(request: ChatCompletionRequest, resolved: ResolvedModel): ProviderRequestPayload;
  parseStreamChunk(data: string): LlmStreamEvent[];
  parseCompletionResponse(data: unknown, resolved: ResolvedModel): ChatCompletionResult;
}

export type ChatMessageRole = "user" | "assistant" | "tool" | "system";

export interface VisibleToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  result?: string;
}

export interface SessionMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  model?: string;
  tool_calls?: VisibleToolCall[];
  tool_results?: VisibleToolCall[];
  reasoning?: string;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
}

export interface SendChatMessageRequest {
  sessionId?: string;
  content: string;
  model: string;
}

export interface SendChatMessageResult {
  sessionId: string;
  userMessage: SessionMessage;
  assistantMessage: SessionMessage;
}

export type ChatStreamEvent =
  | { type: "token"; sessionId: string; messageId: string; token: string }
  | { type: "reasoning"; sessionId: string; messageId: string; token: string }
  | { type: "tool_call"; sessionId: string; messageId: string; toolCall: VisibleToolCall }
  | { type: "done"; sessionId: string; messageId: string; message: SessionMessage }
  | { type: "error"; sessionId: string; messageId?: string; error: string };

export interface ProviderKeyConfig {
  providerId: string;
  apiKey?: string;
  apiKeyMasked?: string;
  baseURL?: string;
}

export interface ModelOption {
  providerId: string;
  providerName: string;
  model: string;
  label: string;
  capabilities: string[];
}

export interface AgentToolSnapshot {
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentSettings {
  id: string;
  name: string;
  yuan: string;
  userName: string;
  chatModel: string;
  utilityModel: string;
  utilityLargeModel: string;
  memoryEnabled: boolean;
  sessionMemoryEnabled: boolean;
  toolsDisabled: string[];
  identityText: string;
  ishikiText: string;
  isActive: boolean;
  tools: AgentToolSnapshot[];
}

export interface SaveAgentSettingsRequest {
  id: string;
  name?: string;
  yuan?: string;
  userName?: string;
  chatModel?: string;
  utilityModel?: string;
  utilityLargeModel?: string;
  memoryEnabled?: boolean;
  sessionMemoryEnabled?: boolean;
  toolsDisabled?: string[];
  identityText?: string;
  ishikiText?: string;
}

export interface CreateAgentRequest {
  id?: string;
  name: string;
  yuan: string;
  chatModel: string;
}

export interface ChannelMember {
  id: string;
  name: string;
  role: "owner" | "member";
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  author: string;
  content: string;
  createdAt: string;
  dm?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  topic?: string;
  members: ChannelMember[];
  createdAt: string;
  updatedAt: string;
  dm?: boolean;
}

export interface DeskFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: DeskFileNode[];
}
