import type { AgentConfig, ModelResolverConfig, ResolvedModel } from "../shared/types.js";
import { createDefaultProviderRegistry, type ProviderRegistry } from "./provider-registry.js";

export class ModelResolver {
  constructor(private readonly providerRegistry: ProviderRegistry = createDefaultProviderRegistry()) {}

  resolveModel(modelRef: string, config: AgentConfig | ModelResolverConfig = {} as ModelResolverConfig): ResolvedModel {
    const { providerId, model } = parseModelRef(modelRef);
    const provider = this.providerRegistry.get(providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const resolverConfig = normalizeResolverConfig(config);
    const providerConfig = resolverConfig.providers?.[providerId];
    const apiKey = providerConfig?.apiKey ?? (provider.envKey ? process.env[provider.envKey] : undefined);

    return {
      provider,
      model,
      apiKey,
      baseURL: providerConfig?.baseURL ?? provider.baseURL,
      resolvedAt: new Date().toISOString()
    };
  }
}

function parseModelRef(modelRef: string): { providerId: string; model: string } {
  const separatorIndex = modelRef.indexOf(":");

  if (separatorIndex === -1) {
    return {
      providerId: "openai",
      model: modelRef
    };
  }

  return {
    providerId: modelRef.slice(0, separatorIndex),
    model: modelRef.slice(separatorIndex + 1)
  };
}

function normalizeResolverConfig(config: AgentConfig | ModelResolverConfig): ModelResolverConfig {
  if ("providers" in config) {
    return config;
  }

  return {};
}
