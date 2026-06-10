import type { ProviderCompat, ProviderCompatLayer } from "../../shared/types.js";
import { BaiduCompat } from "./baidu.js";
import { DeepSeekCompat } from "./deepseek.js";
import { MoonshotCompat } from "./moonshot.js";
import { OpenAICompat } from "./openai.js";
import { QwenCompat } from "./qwen.js";
import { ZhipuCompat } from "./zhipu.js";

const compatLayers: Record<ProviderCompatLayer, ProviderCompat> = {
  openai: new OpenAICompat(),
  zhipu: new ZhipuCompat(),
  qwen: new QwenCompat(),
  deepseek: new DeepSeekCompat(),
  baidu: new BaiduCompat(),
  moonshot: new MoonshotCompat()
};

export function getProviderCompat(layer: ProviderCompatLayer): ProviderCompat {
  return compatLayers[layer];
}

export { BaiduCompat, DeepSeekCompat, MoonshotCompat, OpenAICompat, QwenCompat, ZhipuCompat };
