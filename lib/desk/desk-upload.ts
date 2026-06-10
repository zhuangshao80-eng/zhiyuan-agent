import type { DeskFileNode } from "../../shared/types.js";

export interface DroppedTextFile {
  name: string;
  type?: string;
  text: () => Promise<string>;
}

export interface DeskUploadResult {
  imported: string[];
  rejected: Array<{ name: string; reason: string }>;
  tree: DeskFileNode[];
}

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".xml"]);

export function sanitizeDeskUploadName(name: string, existingNames: string[] = []): string {
  const baseName = name.split(/[\\/]/).pop()?.trim();
  if (!baseName || baseName === "." || baseName === "..") {
    throw new Error("文件名为空或非法");
  }
  if (name.startsWith("/") || name.includes("..") || /[\\/]/.test(name)) {
    throw new Error("文件名不能包含路径或越界片段");
  }

  const safe = baseName.replace(/[^\w\u4e00-\u9fa5.-]/g, "_");
  if (!safe || safe.startsWith(".")) {
    throw new Error("文件名非法");
  }

  const extIndex = safe.lastIndexOf(".");
  const stem = extIndex > 0 ? safe.slice(0, extIndex) : safe;
  const ext = extIndex > 0 ? safe.slice(extIndex) : "";
  let candidate = safe;
  let counter = 1;
  const existing = new Set(existingNames);
  while (existing.has(candidate)) {
    candidate = `${stem}-${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

export function isSupportedTextFile(name: string, mimeType = ""): boolean {
  const lowerName = name.toLowerCase();
  const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
  return mimeType.startsWith("text/") || mimeType === "application/json" || TEXT_EXTENSIONS.has(ext);
}

export async function importDroppedTextFiles(
  files: DroppedTextFile[],
  writeFile: (filePath: string, content: string) => Promise<DeskFileNode[]>,
  existingNames: string[] = []
): Promise<DeskUploadResult> {
  const imported: string[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  let tree: DeskFileNode[] = [];
  const usedNames = [...existingNames];

  for (const file of files) {
    try {
      if (!isSupportedTextFile(file.name, file.type)) {
        throw new Error("仅支持文本、Markdown、JSON、YAML、代码等文本文件");
      }
      const safeName = sanitizeDeskUploadName(file.name, usedNames);
      const content = await file.text();
      if (content.includes("\u0000")) {
        throw new Error("疑似二进制文件，已拒绝");
      }
      tree = await writeFile(safeName, content);
      usedNames.push(safeName);
      imported.push(safeName);
    } catch (error) {
      rejected.push({ name: file.name, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { imported, rejected, tree };
}
