import fs from "node:fs/promises";
import path from "node:path";
import { createSamplePluginHtml, PLUGIN_IFRAME_SANDBOX } from "../lib/plugin/plugin-host-protocol.js";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions?: string[];
  description?: string;
}

export interface PluginRuntime {
  id: string;
  manifest: PluginManifest;
  status: "installed" | "loaded" | "unloaded";
  sandbox: {
    type: "iframe";
    src: string;
    sandbox: string;
  };
  messages: Array<{ direction: "host-to-plugin" | "plugin-to-host"; payload: unknown; createdAt: string }>;
}

export interface PluginSdk {
  version: string;
  methods: string[];
}

export class PluginManager {
  private readonly plugins = new Map<string, PluginRuntime>();

  constructor(private readonly pluginsDir = path.join(process.cwd(), "plugins")) {}

  getSdk(): PluginSdk {
    return {
      version: "0.1",
      methods: ["register", "load", "unload", "postMessage", "onMessage", "listMarket"]
    };
  }

  async register(manifest: PluginManifest): Promise<PluginRuntime> {
    const normalized = normalizeManifest(manifest);
    const pluginDir = path.join(this.pluginsDir, normalized.id);
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.json"), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await this.ensureEntryDocument(pluginDir, normalized);
    const runtime = this.createRuntime(normalized, "installed");
    this.plugins.set(normalized.id, runtime);
    return runtime;
  }

  async installFromMarket(pluginId: string): Promise<PluginRuntime> {
    const marketPlugin = (await this.listMarket()).find((plugin) => plugin.id === pluginId);
    if (!marketPlugin) throw new Error(`Plugin not found in market: ${pluginId}`);
    return this.register(marketPlugin);
  }

  async load(pluginId: string): Promise<PluginRuntime> {
    const runtime = (await this.ensureLoadedFromDisk(pluginId)) ?? this.plugins.get(pluginId);
    if (!runtime) throw new Error(`Plugin not found: ${pluginId}`);
    runtime.status = "loaded";
    this.plugins.set(pluginId, runtime);
    return runtime;
  }

  async unload(pluginId: string): Promise<PluginRuntime> {
    const runtime = this.plugins.get(pluginId) ?? (await this.ensureLoadedFromDisk(pluginId));
    if (!runtime) throw new Error(`Plugin not found: ${pluginId}`);
    runtime.status = "unloaded";
    return runtime;
  }

  async update(pluginId: string, patch: Partial<PluginManifest>): Promise<PluginRuntime> {
    const runtime = this.plugins.get(pluginId) ?? (await this.ensureLoadedFromDisk(pluginId));
    if (!runtime) throw new Error(`Plugin not found: ${pluginId}`);
    return this.register({ ...runtime.manifest, ...patch, id: pluginId });
  }

  async list(): Promise<PluginRuntime[]> {
    await fs.mkdir(this.pluginsDir, { recursive: true });
    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => this.ensureLoadedFromDisk(entry.name)));
    return [...this.plugins.values()];
  }

  async listMarket(): Promise<PluginManifest[]> {
    return [
      {
        id: "desk-notes",
        name: "Desk Notes",
        version: "0.1.0",
        entry: "index.html",
        description: "Desk 便签插件",
        permissions: ["desk:read", "desk:write"]
      },
      {
        id: "channel-helper",
        name: "Channel Helper",
        version: "0.1.0",
        entry: "index.html",
        description: "频道消息辅助插件",
        permissions: ["channels:read"]
      }
    ];
  }

  postMessage(pluginId: string, payload: unknown): { delivered: boolean; reply: unknown } {
    const runtime = this.plugins.get(pluginId);
    if (!runtime || runtime.status !== "loaded") {
      throw new Error(`Plugin is not loaded: ${pluginId}`);
    }
    runtime.messages.push({ direction: "host-to-plugin", payload, createdAt: new Date().toISOString() });
    const reply = { type: "plugin:ack", pluginId, payload };
    runtime.messages.push({ direction: "plugin-to-host", payload: reply, createdAt: new Date().toISOString() });
    return { delivered: true, reply };
  }

  async getHostDocument(pluginId: string): Promise<{ pluginId: string; srcDoc: string; sandbox: string }> {
    const runtime = this.plugins.get(pluginId) ?? (await this.ensureLoadedFromDisk(pluginId));
    if (!runtime) throw new Error(`Plugin not found: ${pluginId}`);
    const entryPath = this.resolveEntryPath(runtime.manifest);
    const srcDoc = await fs.readFile(entryPath, "utf8");
    return { pluginId, srcDoc, sandbox: PLUGIN_IFRAME_SANDBOX };
  }

  private createRuntime(manifest: PluginManifest, status: PluginRuntime["status"]): PluginRuntime {
    return {
      id: manifest.id,
      manifest,
      status,
      sandbox: {
        type: "iframe",
        src: `plugin://${manifest.id}/${manifest.entry}`,
        sandbox: PLUGIN_IFRAME_SANDBOX
      },
      messages: []
    };
  }

  private async ensureLoadedFromDisk(pluginId: string): Promise<PluginRuntime | undefined> {
    if (this.plugins.has(pluginId)) return this.plugins.get(pluginId);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(this.pluginsDir, pluginId, "plugin.json"), "utf8")) as PluginManifest;
      const normalized = normalizeManifest(manifest);
      await this.ensureEntryDocument(path.join(this.pluginsDir, pluginId), normalized);
      const runtime = this.createRuntime(normalized, "installed");
      this.plugins.set(pluginId, runtime);
      return runtime;
    } catch {
      return undefined;
    }
  }

  private async ensureEntryDocument(pluginDir: string, manifest: PluginManifest): Promise<void> {
    const entryPath = path.resolve(pluginDir, manifest.entry);
    const relative = path.relative(pluginDir, entryPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Plugin entry escapes plugin directory: ${manifest.entry}`);
    }

    try {
      await fs.access(entryPath);
    } catch {
      await fs.writeFile(entryPath, createSamplePluginHtml(manifest.id, manifest.name), "utf8");
    }
  }

  private resolveEntryPath(manifest: PluginManifest): string {
    const pluginDir = path.join(this.pluginsDir, manifest.id);
    const entryPath = path.resolve(pluginDir, manifest.entry);
    const relative = path.relative(pluginDir, entryPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Plugin entry escapes plugin directory: ${manifest.entry}`);
    }

    return entryPath;
  }
}

function normalizeManifest(manifest: PluginManifest): PluginManifest {
  const id = manifest.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  if (!id) throw new Error("Plugin id is required");
  return {
    ...manifest,
    id,
    name: manifest.name.trim() || id,
    version: manifest.version || "0.1.0",
    entry: manifest.entry || "index.html",
    permissions: manifest.permissions ?? []
  };
}
