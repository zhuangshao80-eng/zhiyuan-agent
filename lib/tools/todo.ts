import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoArgs {
  action: "create" | "list" | "update" | "delete";
  id?: string;
  title?: string;
  done?: boolean;
}

export const todoTool: ToolDefinition<TodoArgs, TodoItem[] | TodoItem | { deleted: boolean }> = {
  name: "todo",
  description: "管理本地任务清单，支持 create/list/update/delete，并持久化。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "list", "update", "delete"] },
      id: { type: "string" },
      title: { type: "string" },
      done: { type: "boolean" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    const file = todoPath(context);
    const todos = await readTodos(file);
    const now = new Date().toISOString();

    if (args.action === "list") {
      return todos;
    }

    if (args.action === "create") {
      if (!args.title?.trim()) {
        throw new Error("todo.create requires title");
      }
      const item: TodoItem = { id: `todo_${Date.now()}`, title: args.title.trim(), done: false, createdAt: now, updatedAt: now };
      todos.push(item);
      await writeTodos(file, todos);
      return item;
    }

    const index = todos.findIndex((todo) => todo.id === args.id);
    if (index === -1) {
      throw new Error(`Todo not found: ${args.id}`);
    }

    if (args.action === "update") {
      todos[index] = {
        ...todos[index],
        title: args.title?.trim() ?? todos[index].title,
        done: args.done ?? todos[index].done,
        updatedAt: now
      };
      await writeTodos(file, todos);
      return todos[index];
    }

    todos.splice(index, 1);
    await writeTodos(file, todos);
    return { deleted: true };
  }
};

function todoPath(context?: ToolExecutionContext): string {
  return path.join(context?.agentDir ?? process.cwd(), "memory", "todos.json");
}

async function readTodos(file: string): Promise<TodoItem[]> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as TodoItem[];
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeTodos(file: string, todos: TodoItem[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(todos, null, 2)}\n`, "utf8");
}
