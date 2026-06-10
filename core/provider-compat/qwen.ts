import { OpenAICompat } from "./openai.js";

export class QwenCompat extends OpenAICompat {
  override readonly compatLayer = "qwen" as const;
  override readonly defaultBaseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
}
