import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as BetterSqliteFactory;

type BetterSqliteFactory = new (filename: string) => BetterSqliteDatabase;

interface BetterSqliteDatabase {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): BetterSqliteStatement<T>;
  transaction<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R;
  close(): void;
}

interface BetterSqliteStatement<T = unknown> {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}

export interface MemoryFactInput {
  id?: string;
  fact: string;
  tags?: string[];
  time?: string;
  sessionId?: string;
  createdAt?: string;
}

export interface MemoryFact {
  id: string;
  fact: string;
  tags: string[];
  time: string;
  sessionId?: string;
  createdAt: string;
}

export interface MemorySearchOptions {
  keyword?: string;
  tags?: string[];
  limit?: number;
}

interface FactRow {
  id: string;
  fact: string;
  tags: string;
  time: string;
  session_id?: string;
  created_at: string;
}

export class FactStore {
  private readonly db: BetterSqliteDatabase;

  constructor(readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  add(input: MemoryFactInput): MemoryFact {
    const fact = normalizeFact(input);
    const tagsJson = JSON.stringify(fact.tags);

    const insert = this.db.prepare(`
      INSERT INTO facts (id, fact, tags, time, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        fact = excluded.fact,
        tags = excluded.tags,
        time = excluded.time,
        session_id = excluded.session_id,
        created_at = excluded.created_at
    `);
    const upsertFts = this.db.prepare(`
      INSERT INTO facts_fts (fact_id, fact, tags)
      VALUES (?, ?, ?)
    `);
    const deleteFts = this.db.prepare("DELETE FROM facts_fts WHERE fact_id = ?");

    const write = this.db.transaction(() => {
      insert.run(fact.id, fact.fact, tagsJson, fact.time, fact.sessionId, fact.createdAt);
      deleteFts.run(fact.id);
      upsertFts.run(fact.id, fact.fact, fact.tags.join(" "));
    });

    write();
    return fact;
  }

  addBatch(inputs: MemoryFactInput[]): MemoryFact[] {
    const facts: MemoryFact[] = [];
    const write = this.db.transaction(() => {
      for (const input of inputs) {
        facts.push(this.add(input));
      }
    });

    write();
    return facts;
  }

  search({ keyword, tags = [], limit = 20 }: MemorySearchOptions = {}): MemoryFact[] {
    const normalizedTags = tags.map(normalizeTag).filter(Boolean);
    const safeLimit = clampLimit(limit);
    const trimmedKeyword = keyword?.trim();
    const rows = trimmedKeyword ? this.searchByKeyword(trimmedKeyword, safeLimit * 3) : this.getRecentRows(safeLimit * 3);

    return rows
      .map(rowToFact)
      .filter((fact) => normalizedTags.every((tag) => fact.tags.includes(tag)))
      .slice(0, safeLimit);
  }

  getRecent(limit = 20): MemoryFact[] {
    return this.getRecentRows(clampLimit(limit)).map(rowToFact);
  }

  count(): number {
    const row = this.db.prepare<{ total: number }>("SELECT COUNT(*) AS total FROM facts").get();
    return row?.total ?? 0;
  }

  optimize(): void {
    this.db.exec("INSERT INTO facts_fts(facts_fts) VALUES('optimize');");
    this.db.exec("PRAGMA optimize;");
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        fact TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        time TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        fact_id UNINDEXED,
        fact,
        tags
      );

      CREATE INDEX IF NOT EXISTS idx_facts_time ON facts(time);
      CREATE INDEX IF NOT EXISTS idx_facts_session_id ON facts(session_id);
    `);
  }

  private searchByKeyword(keyword: string, limit: number): FactRow[] {
    const query = toFtsQuery(keyword);
    const ftsRows = this.db
      .prepare<FactRow>(`
        SELECT facts.*
        FROM facts_fts
        JOIN facts ON facts.id = facts_fts.fact_id
        WHERE facts_fts MATCH ?
        ORDER BY bm25(facts_fts), facts.time DESC
        LIMIT ?
      `)
      .all(query, limit);

    if (ftsRows.length > 0) {
      return ftsRows;
    }

    const exactRows = this.db
      .prepare<FactRow>(`
        SELECT *
        FROM facts
        WHERE fact LIKE ? OR tags LIKE ?
        ORDER BY time DESC, created_at DESC
        LIMIT ?
      `)
      .all(`%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, limit);

    if (exactRows.length > 0) {
      return exactRows;
    }

    const terms = extractSearchTerms(keyword);
    if (terms.length === 0) {
      return [];
    }

    const clauses = terms.map(() => "(fact LIKE ? OR tags LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${escapeLike(term)}%`, `%${escapeLike(term)}%`]);
    return this.db
      .prepare<FactRow>(`
        SELECT *
        FROM facts
        WHERE ${clauses}
        ORDER BY time DESC, created_at DESC
        LIMIT ?
      `)
      .all(...params, limit);
  }

  private getRecentRows(limit: number): FactRow[] {
    return this.db
      .prepare<FactRow>("SELECT * FROM facts ORDER BY time DESC, created_at DESC LIMIT ?")
      .all(limit);
  }
}

function normalizeFact(input: MemoryFactInput): MemoryFact {
  const now = new Date().toISOString();
  const fact = input.fact.trim();
  if (!fact) {
    throw new Error("Memory fact cannot be empty");
  }

  return {
    id: input.id ?? `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fact,
    tags: [...new Set((input.tags ?? []).map(normalizeTag).filter(Boolean))],
    time: input.time ?? now,
    sessionId: input.sessionId,
    createdAt: input.createdAt ?? now
  };
}

function rowToFact(row: FactRow): MemoryFact {
  return {
    id: row.id,
    fact: row.fact,
    tags: safeParseTags(row.tags),
    time: row.time,
    sessionId: row.session_id,
    createdAt: row.created_at
  };
}

function safeParseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).map(normalizeTag).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function toFtsQuery(keyword: string): string {
  const tokens = keyword
    .split(/\s+/)
    .map((token) => token.replace(/["*]/g, "").trim())
    .filter(Boolean);

  return tokens.length > 0 ? tokens.map((token) => `"${token}"*`).join(" OR ") : "\"\"";
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(Math.floor(limit), 100));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function extractSearchTerms(keyword: string): string[] {
  const normalized = keyword
    .replace(/[？?。！!，,、；;：:（）()[\]{}"“”'‘’]/g, " ")
    .replace(/我的|我|你|吗|呢|是什么|什么|多少|请问|告诉|一下|查询|搜索|记得|知道/g, " ")
    .trim();
  const terms = normalized.split(/\s+/).filter((term) => term.length >= 2);
  const cjkTerms = [...keyword.matchAll(/[\u4e00-\u9fa5]{2,}/g)]
    .map((match) => match[0])
    .flatMap((chunk) => {
      const cleaned = chunk.replace(/我的|是什么|什么|请问|告诉|一下|查询|搜索|记得|知道/g, "");
      const result: string[] = [];
      if (cleaned.length >= 2) {
        result.push(cleaned);
      }
      for (const important of ["生日", "偏好", "喜欢", "颜色", "界面", "名字", "项目", "决定", "待办"]) {
        if (chunk.includes(important)) {
          result.push(important);
        }
      }
      return result;
    });

  return [...new Set([...terms, ...cjkTerms])].slice(0, 8);
}
