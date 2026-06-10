import { OpenAICompat } from "./openai.js";

export class MoonshotCompat extends OpenAICompat {
  override readonly compatLayer = "moonshot" as const;
  override readonly defaultBaseURL = "https://api.moonshot.cn/v1";
}
