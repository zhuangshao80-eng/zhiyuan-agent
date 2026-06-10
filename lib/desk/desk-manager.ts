import fs from "node:fs/promises";
import path from "node:path";

export interface DeskPaths {
  deskDir: string;
  cronJobsPath: string;
  cronRunsDir: string;
  automationsDir: string;
  deferredPath: string;
  channelsDir: string;
  sessionFoldersPath: string;
}

export class DeskManager {
  readonly paths: DeskPaths;

  constructor(readonly agentDir: string) {
    const deskDir = path.join(agentDir, "desk");
    this.paths = {
      deskDir,
      cronJobsPath: path.join(deskDir, "cron-jobs.json"),
      cronRunsDir: path.join(deskDir, "cron-runs"),
      automationsDir: path.join(deskDir, "automations"),
      deferredPath: path.join(deskDir, "deferred-results.json"),
      channelsDir: path.join(deskDir, "channels"),
      sessionFoldersPath: path.join(deskDir, "session-folders.json")
    };
  }

  async ensure(): Promise<DeskPaths> {
    await Promise.all([
      fs.mkdir(this.paths.deskDir, { recursive: true }),
      fs.mkdir(this.paths.cronRunsDir, { recursive: true }),
      fs.mkdir(this.paths.automationsDir, { recursive: true }),
      fs.mkdir(this.paths.channelsDir, { recursive: true })
    ]);
    await ensureJson(this.paths.cronJobsPath, []);
    await ensureJson(this.paths.deferredPath, []);
    await ensureJson(this.paths.sessionFoldersPath, []);
    return this.paths;
  }
}

async function ensureJson(filePath: string, fallback: unknown): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}
