import { OpenAICompat } from "./openai.js";

export class BaiduCompat extends OpenAICompat {
  override readonly compatLayer = "baidu" as const;
  override readonly defaultBaseURL = "https://qianfan.baidubce.com/v2";
}
