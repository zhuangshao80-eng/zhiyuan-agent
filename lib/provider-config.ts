import fs from "node:fs/promises";
import path from "node:path";
import type { ModelResolverConfig, ProviderKeyConfig } from "../shared/types.js";

export class ProviderConfigStore {
  constructor(private readonly filePath = path.join(process.cwd(), "user-data", "provider-keys.json")) {}

  async list(): Promise<ProviderKeyConfig[]> {
    const data = await this.read();
    return Object.entries(data.providers ?? {}).map(([providerId, config]) => ({
      providerId,
      apiKeyMasked: maskSecret(config.apiKey),
      baseURL: config.baseURL
    }));
  }

  async save(config: ProviderKeyConfig): Promise<void> {
    const data = await this.read();
    data.providers = data.providers ?? {};
    const previous = data.providers[config.providerId];
    const nextApiKey = normalizeApiKeyInput(config.apiKey);

    data.providers[config.providerId] = {
      apiKey: nextApiKey ?? previous?.apiKey,
      baseURL: config.baseURL?.trim() || undefined
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async delete(providerId: string): Promise<void> {
    const data = await this.read();
    if (data.providers) {
      delete data.providers[providerId];
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async toResolverConfig(): Promise<ModelResolverConfig> {
    return this.read();
  }

  private async read(): Promise<ModelResolverConfig> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8")) as ModelResolverConfig;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return { providers: {} };
      }

      throw error;
    }
  }
}

function normalizeApiKeyInput(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("****")) {
    return undefined;
  }

  return trimmed;
}

function maskSecret(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
