import fs from "node:fs/promises";
import path from "node:path";
import { DeskManager } from "./desk-manager.js";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  task: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface CronRun {
  id: string;
  jobId: string;
  status: "completed" | "failed" | "skipped";
  output?: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export class CronStore {
  private readonly manager: DeskManager;

  constructor(readonly agentDir: string) {
    this.manager = new DeskManager(agentDir);
  }

  async list(): Promise<CronJob[]> {
    const paths = await this.manager.ensure();
    return JSON.parse(await fs.readFile(paths.cronJobsPath, "utf8")) as CronJob[];
  }

  async upsert(input: Partial<CronJob> & Pick<CronJob, "name" | "schedule" | "task">): Promise<CronJob> {
    const jobs = await this.list();
    const now = new Date().toISOString();
    const id = input.id ?? `cron_${Date.now()}`;
    const existing = jobs.findIndex((job) => job.id === id);
    const next: CronJob = {
      id,
      name: input.name,
      schedule: input.schedule,
      task: input.task,
      enabled: input.enabled ?? true,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      lastRunAt: input.lastRunAt,
      nextRunAt: input.nextRunAt
    };
    if (existing === -1) jobs.push(next);
    else jobs[existing] = { ...jobs[existing], ...next, createdAt: jobs[existing].createdAt };
    await this.save(jobs);
    return existing === -1 ? next : jobs[existing];
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const jobs = await this.list();
    const next = jobs.filter((job) => job.id !== id);
    await this.save(next);
    return { deleted: next.length !== jobs.length };
  }

  async setEnabled(id: string, enabled: boolean): Promise<CronJob> {
    const jobs = await this.list();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error(`Cron job not found: ${id}`);
    jobs[index] = { ...jobs[index], enabled, updatedAt: new Date().toISOString() };
    await this.save(jobs);
    return jobs[index];
  }

  async recordRun(run: Omit<CronRun, "id">): Promise<CronRun> {
    const paths = await this.manager.ensure();
    const stored: CronRun = { id: `run_${Date.now()}`, ...run };
    await fs.writeFile(path.join(paths.cronRunsDir, `${stored.id}.json`), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return stored;
  }

  private async save(jobs: CronJob[]): Promise<void> {
    const paths = await this.manager.ensure();
    await fs.writeFile(paths.cronJobsPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
  }
}
