import { CronScheduler } from "../desk/cron-scheduler.js";
import { CronStore } from "../desk/cron-store.js";
import type { ToolDefinition } from "./types.js";

export interface CronToolArgs {
  action: "create" | "list" | "update" | "delete" | "enable" | "disable" | "run_due";
  id?: string;
  name?: string;
  schedule?: string;
  task?: string;
}

export const cronTool: ToolDefinition<CronToolArgs, unknown> = {
  name: "cron_tool",
  description: "管理 Desk 定时任务，持久化到 cron-jobs.json 并记录 cron-runs。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "list", "update", "delete", "enable", "disable", "run_due"] },
      id: { type: "string" },
      name: { type: "string" },
      schedule: { type: "string", description: "支持 every 1m 或五段 cron 的分钟/小时位" },
      task: { type: "string" }
    },
    required: ["action"]
  },
  async execute(args, context) {
    if (!context?.agentDir) throw new Error("cron_tool requires agentDir");
    const store = new CronStore(context.agentDir);
    if (args.action === "list") return store.list();
    if (args.action === "delete") return store.remove(required(args.id, "id"));
    if (args.action === "enable") return store.setEnabled(required(args.id, "id"), true);
    if (args.action === "disable") return store.setEnabled(required(args.id, "id"), false);
    if (args.action === "run_due") return new CronScheduler(store, context.agentDir).tick(new Date());
    return store.upsert({
      id: args.id,
      name: required(args.name, "name"),
      schedule: required(args.schedule, "schedule"),
      task: required(args.task, "task")
    });
  }
};

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`cron_tool requires ${name}`);
  return value;
}
