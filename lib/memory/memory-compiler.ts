import fs from "node:fs/promises";
import path from "node:path";
import { FactStore, type MemoryFact } from "./fact-store.js";

export interface MemoryCompilerOptions {
  memoryDir: string;
  factStore?: FactStore;
  now?: Date;
}

export interface CompiledMemory {
  memory: string;
  today: string;
  week: string;
  longterm: string;
  facts: string;
}

export async function compileMemory({ memoryDir, factStore, now = new Date() }: MemoryCompilerOptions): Promise<CompiledMemory> {
  await fs.mkdir(memoryDir, { recursive: true });
  const store = factStore ?? new FactStore(path.join(memoryDir, "facts.db"));
  const closeStore = !factStore;

  try {
    const facts = dedupeFacts(store.getRecent(100)).sort((left, right) => scoreFact(right, now) - scoreFact(left, now));
    const summaries = await readSummaries(path.join(memoryDir, "summaries"));
    const todayFacts = facts.filter((fact) => ageDays(fact.time, now) <= 1);
    const weekFacts = facts.filter((fact) => ageDays(fact.time, now) <= 7);
    const longtermFacts = facts.filter((fact) => fact.tags.includes("preference") || fact.tags.includes("longterm") || ageDays(fact.time, now) > 7);
    const compiled: CompiledMemory = {
      facts: renderFacts("事实库", facts),
      today: renderFacts("今日记忆", todayFacts),
      week: renderFacts("本周记忆", weekFacts),
      longterm: renderFacts("长期记忆", longtermFacts),
      memory: renderMemory(facts, summaries)
    };

    await Promise.all([
      fs.writeFile(path.join(memoryDir, "facts.md"), compiled.facts, "utf8"),
      fs.writeFile(path.join(memoryDir, "today.md"), compiled.today, "utf8"),
      fs.writeFile(path.join(memoryDir, "week.md"), compiled.week, "utf8"),
      fs.writeFile(path.join(memoryDir, "longterm.md"), compiled.longterm, "utf8"),
      fs.writeFile(path.join(memoryDir, "memory.md"), compiled.memory, "utf8")
    ]);

    return compiled;
  } finally {
    if (closeStore) {
      store.close();
    }
  }
}

function renderMemory(facts: MemoryFact[], summaries: string[]): string {
  return [
    "# Agent Memory",
    "",
    "## 高优先级事实",
    renderFactItems(facts.slice(0, 20)),
    "",
    "## 会话摘要",
    summaries.slice(0, 10).join("\n\n") || "- 无",
    ""
  ].join("\n");
}

function renderFacts(title: string, facts: MemoryFact[]): string {
  return [`# ${title}`, "", renderFactItems(facts), ""].join("\n");
}

function renderFactItems(facts: MemoryFact[]): string {
  if (facts.length === 0) {
    return "- 无";
  }

  return facts.map((fact) => `- ${fact.fact} ${fact.tags.length > 0 ? `#${fact.tags.join(" #")}` : ""} (${fact.time})`).join("\n");
}

async function readSummaries(summariesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(summariesDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort().reverse();
    return Promise.all(files.map((file) => fs.readFile(path.join(summariesDir, file), "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function dedupeFacts(facts: MemoryFact[]): MemoryFact[] {
  const seen = new Set<string>();
  const result: MemoryFact[] = [];
  for (const fact of facts) {
    const key = fact.fact.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(fact);
    }
  }

  return result;
}

function scoreFact(fact: MemoryFact, now: Date): number {
  const recency = Math.max(0.1, 1 / (1 + ageDays(fact.time, now)));
  const importance = 1 + Number(fact.tags.includes("important")) + Number(fact.tags.includes("preference")) + Number(fact.tags.includes("decision"));
  return recency * importance;
}

function ageDays(value: string, now: Date): number {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return 999;
  }

  return Math.max(0, (now.getTime() - time) / 86_400_000);
}
