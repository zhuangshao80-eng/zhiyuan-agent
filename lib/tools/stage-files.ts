import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

export interface StageFilesArgs {
  files: string[];
  note?: string;
}

export const stageFilesTool: ToolDefinition<StageFilesArgs, { staged: string[]; manifest: string }> = {
  name: "stage_files",
  description: "标记本轮交付文件，写入本地交付 manifest。",
  parameters: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" } },
      note: { type: "string" }
    },
    required: ["files"]
  },
  async execute({ files, note }, context) {
    const root = path.resolve(context?.cwd ?? process.cwd());
    const safeFiles = files.map((file) => normalizeStagedFile(root, file));
    const manifest = path.join(root, "artifacts", "staged-files.json");
    const payload = { files: safeFiles, note, stagedAt: new Date().toISOString() };
    await fs.mkdir(path.dirname(manifest), { recursive: true });
    await fs.writeFile(manifest, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { staged: safeFiles, manifest };
  }
};

function normalizeStagedFile(root: string, file: string): string {
  const trimmed = file.trim();
  if (!trimmed) {
    throw new Error("stage_files refuses empty file path");
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error("stage_files refuses absolute file path");
  }

  const resolved = path.resolve(root, trimmed);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("stage_files path escapes workspace sandbox");
  }

  return relative;
}
