import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

export interface FileOpsArgs {
  action: "read" | "write" | "edit" | "glob" | "grep";
  filePath?: string;
  content?: string;
  search?: string;
  replace?: string;
  pattern?: string;
}

export const fileOpsTool: ToolDefinition<FileOpsArgs, unknown> = {
  name: "file_ops",
  description: "在工作区沙箱内读取、写入、编辑、glob 和 grep 文件。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["read", "write", "edit", "glob", "grep"] },
      filePath: { type: "string" },
      content: { type: "string" },
      search: { type: "string" },
      replace: { type: "string" },
      pattern: { type: "string" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    const root = path.resolve(context?.cwd ?? process.cwd());
    if (args.action === "glob") {
      const result = await walk(root, args.pattern ?? "");
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: args.pattern ?? "", outcome: "allowed", detail: "glob" });
      return result;
    }
    if (args.action === "grep") {
      const result = await grep(root, args.pattern ?? "");
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: args.pattern ?? "", outcome: "allowed", detail: "grep" });
      return result;
    }

    let file: string;
    try {
      file = await resolveInside(root, args.filePath, args.action);
    } catch (error) {
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: args.filePath, outcome: "denied", detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    if (args.action === "read") {
      const content = await fs.readFile(file, "utf8");
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: file, outcome: "allowed", detail: "read" });
      return { filePath: file, content };
    }
    if (args.action === "write") {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, args.content ?? "", "utf8");
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: file, outcome: "allowed", detail: "write" });
      return { filePath: file, written: true };
    }
    if (args.action === "edit") {
      const original = await fs.readFile(file, "utf8");
      if (!args.search) {
        throw new Error("file_ops.edit requires search");
      }
      const next = original.replace(args.search, args.replace ?? "");
      await fs.writeFile(file, next, "utf8");
      await context?.auditLog?.record({ action: "tool.file_ops", subject: "agent", resource: file, outcome: "allowed", detail: "edit" });
      return { filePath: file, changed: next !== original };
    }
    throw new Error(`Unsupported file action: ${args.action}`);
  }
};

async function resolveInside(root: string, filePath: string | undefined, action: FileOpsArgs["action"]): Promise<string> {
  if (!filePath) {
    throw new Error("filePath is required");
  }
  const resolved = path.resolve(root, filePath);
  if (!isInside(root, resolved)) {
    throw new Error("Path escapes workspace sandbox");
  }

  const realRoot = await fs.realpath(root);
  if (action === "read" || action === "edit") {
    const realFile = await fs.realpath(resolved);
    if (!isInside(realRoot, realFile)) {
      throw new Error("Path escapes workspace sandbox");
    }
    return realFile;
  }

  const existingParent = await nearestExistingParent(path.dirname(resolved), root);
  const realParent = await fs.realpath(existingParent);
  if (!isInside(realRoot, realParent)) {
    throw new Error("Path escapes workspace sandbox");
  }

  return resolved;
}

async function walk(root: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  const realRoot = await fs.realpath(root);
  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      const realFull = await fs.realpath(full).catch(() => "");
      if (!realFull || !isInside(realRoot, realFull)) continue;
      if (entry.isDirectory()) await visit(full);
      else if (!pattern || full.includes(pattern)) results.push(path.relative(root, full));
      if (results.length >= 200) return;
    }
  }
  await visit(root);
  return results;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nearestExistingParent(dir: string, root: string): Promise<string> {
  if (!isInside(root, dir)) {
    throw new Error("Path escapes workspace sandbox");
  }

  let current = dir;
  while (isInside(root, current)) {
    try {
      const stat = await fs.stat(current);
      if (stat.isDirectory()) {
        return current;
      }
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return root;
}

async function grep(root: string, pattern: string): Promise<Array<{ file: string; line: number; text: string }>> {
  const files = await walk(root, "");
  const results: Array<{ file: string; line: number; text: string }> = [];
  for (const file of files) {
    const full = path.join(root, file);
    const text = await fs.readFile(full, "utf8").catch(() => "");
    text.split(/\r?\n/).forEach((line, index) => {
      if (pattern && line.includes(pattern)) results.push({ file, line: index + 1, text: line.slice(0, 240) });
    });
    if (results.length >= 100) break;
  }
  return results;
}
