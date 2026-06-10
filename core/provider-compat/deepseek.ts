import type { ChatCompletionResult, ResolvedModel } from "../../shared/types.js";
import { OpenAICompat } from "./openai.js";

export class DeepSeekCompat extends OpenAICompat {
  override readonly compatLayer = "deepseek" as const;
  override readonly defaultBaseURL = "https://api.deepseek.com/v1";

  override parseCompletionResponse(data: unknown, resolved: ResolvedModel): ChatCompletionResult {
    const result = super.parseCompletionResponse(data, resolved);
    const response = data as {
      choices?: Array<{
        message?: {
          reasoning_content?: string;
        };
      }>;
    };

    return {
      ...result,
      reasoningContent: response.choices?.[0]?.message?.reasoning_content ?? result.reasoningContent
    };
  }
}
