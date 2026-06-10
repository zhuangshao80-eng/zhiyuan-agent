import fs from "node:fs/promises";
import path from "node:path";

export interface AuditLogEntry {
  id: string;
  action: string;
  subject: string;
  resource?: string;
  outcome: "allowed" | "denied" | "info";
  detail?: string;
  createdAt: string;
}

export class AuditLog {
  constructor(private readonly logPath = path.join(process.cwd(), "user-data", "security", "audit-log.jsonl")) {}

  async record(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<AuditLogEntry> {
    const next: AuditLogEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    };
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    await fs.appendFile(this.logPath, `${JSON.stringify(next)}\n`, "utf8");
    return next;
  }

  async list(limit = 100): Promise<AuditLogEntry[]> {
    try {
      const text = await fs.readFile(this.logPath, "utf8");
      return text
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditLogEntry)
        .slice(-limit)
        .reverse();
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
