import type { ProviderDescriptor } from "../shared/types.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderDescriptor>();

  register(provider: ProviderDescriptor): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  list(): ProviderDescriptor[] {
    return [...this.providers.values()];
  }

  get(providerId: string): ProviderDescriptor | undefined {
    return this.providers.get(providerId);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }
}

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  for (const provider of defaultProviders) {
    registry.register(provider);
  }

  return registry;
}

export const defaultProviders: ProviderDescriptor[] = [
  {
    id: "openai",
    name: "OpenAI",
    authType: "apikey",
    compatLayer: "openai",
    baseURL: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    enabled: true
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    authType: "apikey",
    compatLayer: "zhipu",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "ZHIPU_API_KEY",
    enabled: true
  },
  {
    id: "qwen",
    name: "通义千问",
    authType: "apikey",
    compatLayer: "qwen",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envKey: "QWEN_API_KEY",
    enabled: true
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    authType: "apikey",
    compatLayer: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    enabled: true
  },
  {
    id: "baidu",
    name: "文心一言",
    authType: "apikey",
    compatLayer: "baidu",
    baseURL: "https://qianfan.baidubce.com/v2",
    envKey: "BAIDU_API_KEY",
    enabled: true
  },
  {
    id: "moonshot",
    name: "Moonshot",
    authType: "apikey",
    compatLayer: "moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    enabled: true
  }
];
