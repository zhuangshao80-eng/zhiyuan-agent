import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  LlmStreamEvent,
  LlmToolCall,
  ProviderCompat,
  ProviderCompatLayer,
  ProviderRequestPayload,
  ResolvedModel
} from "../../shared/types.js";

interface OpenAIChoiceDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export class OpenAICompat implements ProviderCompat {
  readonly compatLayer: ProviderCompatLayer = "openai";
  readonly defaultBaseURL: string = "https://api.openai.com/v1";

  buildURL(resolved: ResolvedModel): string {
    return `${trimTrailingSlash(resolved.baseURL)}/chat/completions`;
  }

  buildHeaders(resolved: ResolvedModel): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (resolved.apiKey) {
      headers.Authorization = `Bearer ${resolved.apiKey}`;
    }

    return headers;
  }

  buildPayload(request: ChatCompletionRequest, resolved: ResolvedModel): ProviderRequestPayload {
    return {
      model: resolved.model,
      messages: request.messages,
      tools: request.tools,
      stream: Boolean(request.stream),
      temperature: request.temperature,
      max_tokens: request.maxTokens
    };
  }

  parseStreamChunk(data: string): LlmStreamEvent[] {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: OpenAIChoiceDelta; finish_reason?: string | null }>;
    };
    const events: LlmStreamEvent[] = [];

    for (const choice of parsed.choices ?? []) {
      const delta = choice.delta ?? {};

      if (delta.reasoning_content) {
        events.push({ type: "reasoning", token: delta.reasoning_content });
      }

      if (delta.content) {
        events.push({ type: "token", token: delta.content });
      }

      for (const toolCall of normalizeToolCalls(delta.tool_calls ?? [])) {
        events.push({ type: "tool_call", toolCall });
      }
    }

    return events;
  }

  parseCompletionResponse(data: unknown, resolved: ResolvedModel): ChatCompletionResult {
    const response = data as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: LlmToolCall[];
        };
      }>;
    };
    const message = response.choices?.[0]?.message;

    return {
      model: resolved.model,
      content: message?.content ?? "",
      reasoningContent: message?.reasoning_content,
      toolCalls: message?.tool_calls ?? [],
      raw: data
    };
  }
}

export function normalizeToolCalls(
  toolCalls: Array<{
    index?: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>
): LlmToolCall[] {
  return toolCalls.map((toolCall, index) => ({
    id: toolCall.id ?? `tool_call_${toolCall.index ?? index}`,
    type: "function",
    function: {
      name: toolCall.function?.name ?? "",
      arguments: toolCall.function?.arguments ?? ""
    }
  }));
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
