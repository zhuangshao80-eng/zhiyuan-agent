import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  LlmStreamEvent,
  LlmToolCall,
  ModelResolverConfig,
  ProviderCompat,
  ResolvedModel
} from "../shared/types.js";
import { ModelResolver } from "./model-resolver.js";
import { getProviderCompat } from "./provider-compat/index.js";

type FetchLike = typeof fetch;

export interface LlmClientOptions {
  modelResolver?: ModelResolver;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class LlmClient {
  private readonly modelResolver: ModelResolver;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: LlmClientOptions = {}) {
    this.modelResolver = options.modelResolver ?? new ModelResolver();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  async chatCompletion(request: ChatCompletionRequest & { stream: true }): Promise<AsyncIterable<LlmStreamEvent>>;
  async chatCompletion(request: ChatCompletionRequest & { stream?: false }): Promise<ChatCompletionResult>;
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult | AsyncIterable<LlmStreamEvent>> {
    const resolved = this.modelResolver.resolveModel(request.model, request.config ?? ({} as ModelResolverConfig));
    const compat = getProviderCompat(resolved.provider.compatLayer);

    if (request.stream) {
      return this.streamChatCompletion(request, resolved, compat);
    }

    return this.completeChatCompletion(request, resolved, compat);
  }

  private async completeChatCompletion(
    request: ChatCompletionRequest,
    resolved: ResolvedModel,
    compat: ProviderCompat
  ): Promise<ChatCompletionResult> {
    assertApiKeyReady(resolved);

    return this.withRetry(async () => {
      const response = await this.fetchImpl(compat.buildURL(resolved), {
        method: "POST",
        headers: compat.buildHeaders(resolved),
        body: JSON.stringify(compat.buildPayload({ ...request, stream: false }, resolved))
      });

      await assertOk(response);
      return compat.parseCompletionResponse(await response.json(), resolved);
    }, (error) => {
      throw error instanceof Error ? error : new Error(String(error));
    });
  }

  private streamChatCompletion(
    request: ChatCompletionRequest,
    resolved: ResolvedModel,
    compat: ProviderCompat
  ): AsyncIterable<LlmStreamEvent> {
    return this.createStreamIterable(request, resolved, compat);
  }

  private async *createStreamIterable(
    request: ChatCompletionRequest,
    resolved: ResolvedModel,
    compat: ProviderCompat
  ): AsyncIterable<LlmStreamEvent> {
    let content = "";
    let reasoningContent = "";
    const toolCallAccumulator = new ToolCallAccumulator();

    try {
      assertApiKeyReady(resolved);

      const response = await this.withRetry(
        async () => {
          const nextResponse = await this.fetchImpl(compat.buildURL(resolved), {
            method: "POST",
            headers: compat.buildHeaders(resolved),
            body: JSON.stringify(compat.buildPayload({ ...request, stream: true }, resolved))
          });

          await assertOk(nextResponse);
          return nextResponse;
        },
        (error) => {
          throw error instanceof Error ? error : new Error(String(error));
        }
      );

      if (!response?.body) {
        yield {
          type: "error",
          error: `LLM request failed for ${resolved.provider.name}/${resolved.model}; using local fallback.`
        };
        yield* fallbackStream(request, resolved);
        return;
      }

      for await (const data of parseSse(response.body)) {
        if (data === "[DONE]") {
          break;
        }

        for (const event of compat.parseStreamChunk(data)) {
          if (event.type === "token") {
            content += event.token;
            yield event;
          } else if (event.type === "reasoning") {
            reasoningContent += event.token;
            yield event;
          } else if (event.type === "tool_call") {
            const toolCall = toolCallAccumulator.merge(event.toolCall);
            yield { type: "tool_call", toolCall };
          }
        }
      }

      yield {
        type: "done",
        result: {
          model: resolved.model,
          content,
          reasoningContent: reasoningContent || undefined,
          toolCalls: toolCallAccumulator.list()
        }
      };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async withRetry<T>(operation: () => Promise<T>, fallback: (error?: unknown) => T): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    if (lastError) {
      return fallback(lastError);
    }

    return fallback();
  }
}

function assertApiKeyReady(resolved: ResolvedModel): void {
  if (resolved.provider.authType === "apikey" && !resolved.apiKey) {
    throw new Error(`缺少 ${resolved.provider.name} API Key，请在右侧供应商 Key 中保存后重试。`);
  }
}

class ToolCallAccumulator {
  private readonly toolCalls = new Map<string, LlmToolCall>();

  merge(next: LlmToolCall): LlmToolCall {
    const existing = this.toolCalls.get(next.id);
    if (!existing) {
      this.toolCalls.set(next.id, next);
      return next;
    }

    const merged: LlmToolCall = {
      ...existing,
      function: {
        name: next.function.name || existing.function.name,
        arguments: `${existing.function.arguments}${next.function.arguments}`
      }
    };

    this.toolCalls.set(next.id, merged);
    return merged;
  }

  list(): LlmToolCall[] {
    return [...this.toolCalls.values()];
  }
}

export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLines = event
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim());

      if (dataLines.length > 0) {
        yield dataLines.join("\n");
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    yield tail.slice("data:".length).trim();
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(`LLM request failed: ${response.status} ${response.statusText} ${body}`.trim());
}

function fallbackText(request: ChatCompletionRequest, resolved: ResolvedModel): string {
  const latestUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
  return `当前模型 ${resolved.provider.name}/${resolved.model} 暂不可用，已进入本地降级回复。收到：${latestUserMessage?.content ?? ""}`;
}

async function* fallbackStream(request: ChatCompletionRequest, resolved: ResolvedModel): AsyncIterable<LlmStreamEvent> {
  let content = "";
  for (const token of splitForStreaming(fallbackText(request, resolved))) {
    content += token;
    yield { type: "token", token };
    await delay(5);
  }

  yield {
    type: "done",
    result: {
      model: resolved.model,
      content,
      toolCalls: []
    }
  };
}

function splitForStreaming(text: string): string[] {
  return Array.from(text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
