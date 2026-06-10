import path from "node:path";
import { AgentManager } from "./agent-manager.js";
import { PluginManager } from "./plugin-manager.js";
import { SkillManager } from "./skill-manager.js";
import { ModelResolver } from "./model-resolver.js";
import { createDefaultProviderRegistry, type ProviderRegistry } from "./provider-registry.js";
import { CustomProviderStore } from "../lib/custom-providers.js";
import type { CoreEvent, CoreEventHandler, EngineStatus } from "../shared/types.js";

export class Engine {
  private static instance: Engine | null = null;
  private status: EngineStatus = "idle";
  private readonly logPrefix = "[Engine]";
  private readonly eventHandlers = new Map<string, Set<CoreEventHandler>>();

  readonly providerRegistry: ProviderRegistry;
  readonly modelResolver: ModelResolver;
  readonly agentManager: AgentManager;
  readonly pluginManager: PluginManager;
  readonly skillManager: SkillManager;

  private constructor() {
    const productDir = process.cwd();
    const agentsDir = path.join(productDir, "agents");
    const userDir = path.join(productDir, "user-data");

    this.providerRegistry = createDefaultProviderRegistry();
    this.modelResolver = new ModelResolver(this.providerRegistry);
    this.pluginManager = new PluginManager(path.join(productDir, "plugins"));
    this.skillManager = new SkillManager(path.join(productDir, "skills"));
    this.agentManager = new AgentManager({
      agentsDir,
      productDir,
      userDir,
      cb: {
        emitEvent: (event) => this.emitEvent(event),
        resolveModel: async (modelRef) => this.modelResolver.resolveModel(modelRef)
      }
    });
  }

  static getInstance(): Engine {
    if (!Engine.instance) {
      Engine.instance = new Engine();
    }

    return Engine.instance;
  }

  async init(): Promise<void> {
    if (this.status === "ready" || this.status === "started" || this.status === "initializing") {
      console.info(`${this.logPrefix} skip init, current status: ${this.status}`);
      return;
    }

    console.info(`${this.logPrefix} start initializing`);
    this.status = "initializing";
    this.emitEvent({ type: "engine:init:start", timestamp: new Date().toISOString() });

    console.info(`${this.logPrefix} loading core modules`);
    await this.loadCustomProviders();
    await this.skillManager.loadInstalled();
    await this.agentManager.createAgent("default");

    this.status = "ready";
    console.info(`${this.logPrefix} status changed to ready`);
    this.emitEvent({ type: "engine:init:ready", timestamp: new Date().toISOString() });
  }

  async initialize(): Promise<void> {
    await this.init();
  }

  async start(): Promise<void> {
    if (this.status === "idle") {
      await this.init();
    }

    if (this.status === "ready") {
      this.status = "started";
      this.emitEvent({ type: "engine:start", timestamp: new Date().toISOString() });
    }
  }

  async dispose(): Promise<void> {
    if (this.status === "disposed") {
      return;
    }

    console.info(`${this.logPrefix} dispose`);
    await this.agentManager.dispose();
    this.status = "disposed";
    this.emitEvent({ type: "engine:dispose", timestamp: new Date().toISOString() });
    this.eventHandlers.clear();
  }

  async destroy(): Promise<void> {
    await this.dispose();
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  emitEvent(event: CoreEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    const wildcardHandlers = this.eventHandlers.get("*");

    for (const handler of [...(handlers ?? []), ...(wildcardHandlers ?? [])]) {
      handler(event);
    }
  }

  onEvent(type: string, handler: CoreEventHandler): () => void {
    const handlers = this.eventHandlers.get(type) ?? new Set<CoreEventHandler>();
    handlers.add(handler);
    this.eventHandlers.set(type, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(type);
      }
    };
  }

  private async loadCustomProviders(): Promise<void> {
    for (const provider of await new CustomProviderStore().list()) {
      this.providerRegistry.register(provider);
    }
  }
}
