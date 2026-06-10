import type { ChatCompletionRequest, ProviderRequestPayload, ResolvedModel } from "../../shared/types.js";
import { OpenAICompat } from "./openai.js";

export class ZhipuCompat extends OpenAICompat {
  override readonly compatLayer = "zhipu" as const;
  override readonly defaultBaseURL = "https://open.bigmodel.cn/api/paas/v4";

  override buildPayload(request: ChatCompletionRequest, resolved: ResolvedModel): ProviderRequestPayload {
    return {
      ...super.buildPayload(request, resolved),
      model: resolved.model
    };
  }
}
