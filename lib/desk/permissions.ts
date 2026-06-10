import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export interface DeskPermissionDecision {
  approved: boolean;
  reason: string;
}

export async function canAutoApprove(agentDir: string): Promise<DeskPermissionDecision> {
  try {
    const config = parse(await fs.readFile(path.join(agentDir, "config.yaml"), "utf8")) as { desk?: { cron_auto_approve?: boolean } };
    const approved = config.desk?.cron_auto_approve !== false;
    return {
      approved,
      reason: approved ? "desk.cron_auto_approve enabled" : "desk.cron_auto_approve disabled"
    };
  } catch {
    return { approved: false, reason: "missing or invalid Agent config" };
  }
}
