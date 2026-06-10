export interface PromptCacheEntry {
  key: string;
  value: string;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

export class PromptCache {
  private readonly entries = new Map<string, PromptCacheEntry>();

  getOrSet(key: string, factory: () => string): PromptCacheEntry {
    const existing = this.entries.get(key);
    if (existing) {
      existing.hits += 1;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const now = new Date().toISOString();
    const entry: PromptCacheEntry = {
      key,
      value: factory(),
      hits: 0,
      createdAt: now,
      updatedAt: now
    };
    this.entries.set(key, entry);
    return entry;
  }

  stats(): { size: number; hits: number } {
    return {
      size: this.entries.size,
      hits: [...this.entries.values()].reduce((total, entry) => total + entry.hits, 0)
    };
  }

  clear(): void {
    this.entries.clear();
  }
}

export const systemPromptCache = new PromptCache();
