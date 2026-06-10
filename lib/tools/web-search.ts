import type { VisibleToolCall } from "../../shared/types.js";
import type { ToolDefinition } from "./types.js";

export interface WebSearchArgs {
  query: string;
  engine?: "local" | "bing" | "google" | "custom";
}

export const webSearchToolDefinition = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "搜索网页并返回摘要结果。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词"
        }
      },
      required: ["query"]
    }
  }
};

export const webSearchTool: ToolDefinition<WebSearchArgs, VisibleToolCall> = {
  name: "web_search",
  description: "搜索网页并返回摘要结果，支持配置搜索引擎。",
  parameters: webSearchToolDefinition.function.parameters,
  execute: ({ query, engine = "local" }) => runWebSearch(query, engine)
};

export function shouldRunWebSearch(content: string): boolean {
  return /\bweb-search\b|\bweb_search\b|搜索|查一下|联网/.test(content);
}

export async function runWebSearch(query: string, engine = "local"): Promise<VisibleToolCall> {
  const normalized = query.replace(/\bweb-search\b|\bweb_search\b|搜索|查一下|联网/g, "").trim() || query;
  const result = [
    `搜索词：${normalized}`,
    `搜索引擎：${engine}`,
    "结果 1：已建立 web-search 工具调用链路，可在真实搜索适配器接入后返回网页结果。",
    "结果 2：当前最小闭环会记录工具调用、参数和结果，并持久化到会话历史。"
  ].join("\n");

  return {
    id: `tool_${Date.now()}`,
    name: "web_search",
    arguments: { query: normalized, engine },
    status: "completed",
    result
  };
}
