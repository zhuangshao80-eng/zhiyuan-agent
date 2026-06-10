import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderDescriptor } from "../shared/types.js";

export class CustomProviderStore {
  constructor(private readonly filePath = path.join(process.cwd(), "user-data", "custom-providers.json")) {}

  async list(): Promise<ProviderDescriptor[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8")) as ProviderDescriptor[];
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(provider: ProviderDescriptor): Promise<ProviderDescriptor[]> {
    const providers = await this.list();
    const next = providers.filter((item) => item.id !== provider.id);
    next.push(provider);
    await this.write(next);
    return next;
  }

  async delete(providerId: string): Promise<ProviderDescriptor[]> {
    const providers = await this.list();
    const next = providers.filter((item) => item.id !== providerId);
    await this.write(next);
    return next;
  }

  private async write(providers: ProviderDescriptor[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(providers, null, 2)}\n`, "utf8");
  }
}

export function normalizeCustomProvider(provider: ProviderDescriptor): ProviderDescriptor {
  return {
    ...provider,
    id: provider.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
    name: provider.name.trim() || provider.id,
    authType: "apikey",
    compatLayer: provider.compatLayer ?? "openai",
    baseURL: provider.baseURL.trim(),
    enabled: true
  };
}
