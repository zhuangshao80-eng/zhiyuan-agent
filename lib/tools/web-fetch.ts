import type { ToolDefinition } from "./types.js";

export interface WebFetchArgs {
  url: string;
}

export const webFetchTool: ToolDefinition<WebFetchArgs, { url: string; markdown: string; title?: string }> = {
  name: "web_fetch",
  description: "抓取 URL 内容，并将 HTML 转为简洁 Markdown。",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "要抓取的 http/https URL" }
    },
    required: ["url"]
  },
  async execute({ url }) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("web_fetch only supports http/https URLs");
    }

    const response = await fetch(parsed.toString(), { headers: { "User-Agent": "ZhiYuan-Agent/0.1" } });
    if (!response.ok) {
      throw new Error(`web_fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
    return {
      url: parsed.toString(),
      title,
      markdown: htmlToMarkdown(html)
    };
  }
};

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "\n- $1")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60_000);
}
