import type { LlmToolDefinition } from "../../shared/types.js";
import type { FactStore, MemoryFact } from "./fact-store.js";

export interface MemorySearchTool {
  definition: LlmToolDefinition;
  execute: (args: { keyword?: string; tags?: string[]; limit?: number }) => Promise<{ results: MemoryFact[]; text: string }>;
}

export function createMemorySearchTool(factStore: FactStore): MemorySearchTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "memory_search",
        description: "搜索 Agent 已记住的事实，支持关键词和标签混合检索。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "关键词" },
            tags: { type: "array", items: { type: "string" }, description: "标签过滤" },
            limit: { type: "number", description: "返回数量" }
          }
        }
      }
    },
    async execute(args) {
      const results = factStore.search({
        keyword: args.keyword,
        tags: args.tags,
        limit: args.limit ?? 8
      });

      return {
        results,
        text: results.length > 0 ? results.map((fact) => `- ${fact.fact} #${fact.tags.join(" #")}`).join("\n") : "未找到相关记忆。"
      };
    }
  };
}
