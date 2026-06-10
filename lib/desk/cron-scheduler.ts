import { CronStore, type CronJob, type CronRun } from "./cron-store.js";
import { canAutoApprove } from "./permissions.js";

export type CronExecutor = (job: CronJob) => Promise<string> | string;

export class CronScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: CronStore,
    private readonly agentDir: string,
    private readonly executor: CronExecutor = (job) => `执行定时任务：${job.task}`
  ) {}

  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<CronRun[]> {
    const jobs = await this.store.list();
    const runs: CronRun[] = [];
    for (const job of jobs.filter((item) => item.enabled && shouldRun(item.schedule, now, item.lastRunAt))) {
      const permission = await canAutoApprove(this.agentDir);
      const startedAt = new Date().toISOString();
      if (!permission.approved) {
        runs.push(await this.store.recordRun({ jobId: job.id, status: "skipped", error: permission.reason, startedAt, finishedAt: startedAt }));
        continue;
      }
      try {
        const output = await this.executor(job);
        const finishedAt = new Date().toISOString();
        await this.store.upsert({ ...job, lastRunAt: finishedAt, nextRunAt: estimateNextRun(job.schedule, now).toISOString() });
        runs.push(await this.store.recordRun({ jobId: job.id, status: "completed", output, startedAt, finishedAt }));
      } catch (error) {
        const finishedAt = new Date().toISOString();
        runs.push(await this.store.recordRun({ jobId: job.id, status: "failed", error: error instanceof Error ? error.message : String(error), startedAt, finishedAt }));
      }
    }
    return runs;
  }
}

export function shouldRun(schedule: string, now: Date, lastRunAt?: string): boolean {
  if (schedule.startsWith("every ")) {
    const minutes = Number(schedule.match(/^every\s+(\d+)m$/)?.[1] ?? 0);
    if (!minutes) return false;
    if (!lastRunAt) return true;
    return now.getTime() - new Date(lastRunAt).getTime() >= minutes * 60_000;
  }
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour] = parts;
  const minuteMatches = minute === "*" || Number(minute) === now.getMinutes();
  const hourMatches = hour === "*" || Number(hour) === now.getHours();
  const lastMinute = lastRunAt ? Math.floor(new Date(lastRunAt).getTime() / 60_000) : -1;
  return minuteMatches && hourMatches && Math.floor(now.getTime() / 60_000) !== lastMinute;
}

function estimateNextRun(schedule: string, now: Date): Date {
  const next = new Date(now);
  const minutes = Number(schedule.match(/^every\s+(\d+)m$/)?.[1] ?? 1);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}
