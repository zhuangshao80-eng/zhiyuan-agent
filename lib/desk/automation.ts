import fs from "node:fs/promises";
import path from "node:path";
import { DeskManager } from "./desk-manager.js";

export interface AutomationStep {
  tool: string;
  args?: Record<string, unknown>;
}

export interface AutomationDefinition {
  id: string;
  name: string;
  steps: AutomationStep[];
  createdAt: string;
  updatedAt: string;
}

export class AutomationRunner {
  private readonly manager: DeskManager;

  constructor(readonly agentDir: string) {
    this.manager = new DeskManager(agentDir);
  }

  async save(definition: Omit<AutomationDefinition, "createdAt" | "updatedAt">): Promise<AutomationDefinition> {
    const paths = await this.manager.ensure();
    const now = new Date().toISOString();
    const stored: AutomationDefinition = { ...definition, createdAt: now, updatedAt: now };
    await fs.writeFile(path.join(paths.automationsDir, `${stored.id}.json`), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return stored;
  }

  async get(id: string): Promise<AutomationDefinition | null> {
    const paths = await this.manager.ensure();
    try {
      return JSON.parse(await fs.readFile(path.join(paths.automationsDir, `${id}.json`), "utf8")) as AutomationDefinition;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async run(id: string): Promise<{ id: string; status: "queued" | "completed"; steps: AutomationStep[] }> {
    const definition = await this.get(id);
    if (!definition) throw new Error(`Automation not found: ${id}`);
    return { id, status: "completed", steps: definition.steps };
  }
}
