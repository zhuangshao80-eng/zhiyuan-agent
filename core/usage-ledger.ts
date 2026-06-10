import fs from "node:fs/promises";
import path from "node:path";

export interface UsageRecord {
  id: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  records: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; records: number }>;
}

export class UsageLedger {
  constructor(private readonly ledgerPath = path.join(process.cwd(), "user-data", "usage-ledger.jsonl")) {}

  async record(input: Omit<UsageRecord, "id" | "createdAt" | "totalTokens">): Promise<UsageRecord> {
    const record: UsageRecord = {
      ...input,
      id: `usage_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      totalTokens: input.inputTokens + input.outputTokens,
      createdAt: new Date().toISOString()
    };
    await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true });
    await fs.appendFile(this.ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async list(limit = 500): Promise<UsageRecord[]> {
    try {
      const text = await fs.readFile(this.ledgerPath, "utf8");
      return text
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as UsageRecord)
        .slice(-limit);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async summary(): Promise<UsageSummary> {
    const records = await this.list();
    const summary: UsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      records: records.length,
      byModel: {}
    };
    for (const record of records) {
      summary.totalInputTokens += record.inputTokens;
      summary.totalOutputTokens += record.outputTokens;
      summary.totalTokens += record.totalTokens;
      summary.byModel[record.model] ??= { inputTokens: 0, outputTokens: 0, totalTokens: 0, records: 0 };
      summary.byModel[record.model].inputTokens += record.inputTokens;
      summary.byModel[record.model].outputTokens += record.outputTokens;
      summary.byModel[record.model].totalTokens += record.totalTokens;
      summary.byModel[record.model].records += 1;
    }
    return summary;
  }
}

export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const asciiWords = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9_]+/g) ?? []).length;
  return Math.max(1, Math.ceil(cjk * 0.7 + asciiWords * 1.3));
}
