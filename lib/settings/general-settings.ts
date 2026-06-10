import fs from "node:fs/promises";
import path from "node:path";

export type Locale = "zh-CN" | "en";

export interface GeneralSettings {
  language: Locale;
  compactMode: boolean;
  reduceMotion: boolean;
  confirmDanger: boolean;
}

export class GeneralSettingsStore {
  constructor(private readonly settingsPath = path.join(process.cwd(), "user-data", "general-settings.json")) {}

  async get(): Promise<GeneralSettings> {
    try {
      return normalize(JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as Partial<GeneralSettings>);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return normalize({});
      }
      throw error;
    }
  }

  async save(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const next = normalize({ ...(await this.get()), ...patch });
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }
}

function normalize(value: Partial<GeneralSettings>): GeneralSettings {
  return {
    language: value.language === "en" ? "en" : "zh-CN",
    compactMode: value.compactMode ?? true,
    reduceMotion: value.reduceMotion ?? false,
    confirmDanger: value.confirmDanger ?? true
  };
}
