import fs from "node:fs/promises";
import path from "node:path";
import type { LlmToolDefinition } from "../../shared/types.js";

export interface PinnedMemoryTools {
  read: {
    definition: LlmToolDefinition;
    execute: () => Promise<string>;
  };
  write: {
    definition: LlmToolDefinition;
    execute: (args: { content: string; mode?: "append" | "replace" }) => Promise<string>;
  };
}

export function createPinnedMemoryTools(agentDir: string): PinnedMemoryTools {
  const pinnedPath = path.join(agentDir, "memory", "pinned.md");

  return {
    read: {
      definition: {
        type: "function",
        function: {
          name: "pinned_memory_read",
          description: "读取用户置顶记忆。"
        }
      },
      execute: () => readPinnedMemory(agentDir)
    },
    write: {
      definition: {
        type: "function",
        function: {
          name: "pinned_memory_write",
          description: "写入或追加用户置顶记忆。",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "记忆内容" },
              mode: { type: "string", enum: ["append", "replace"], description: "写入模式" }
            },
            required: ["content"]
          }
        }
      },
      execute: async ({ content, mode = "append" }) => {
        await fs.mkdir(path.dirname(pinnedPath), { recursive: true });
        const normalized = `${content.trim()}\n`;
        if (mode === "replace") {
          await fs.writeFile(pinnedPath, normalized, "utf8");
        } else {
          await fs.appendFile(pinnedPath, normalized, "utf8");
        }

        return readPinnedMemory(agentDir);
      }
    }
  };
}

export async function readPinnedMemory(agentDir: string): Promise<string> {
  try {
    return await fs.readFile(path.join(agentDir, "memory", "pinned.md"), "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
