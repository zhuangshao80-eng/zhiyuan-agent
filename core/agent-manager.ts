import { Agent } from "./agent.js";
import type { AgentManagerOptions } from "../shared/types.js";

export class AgentManager {
  private readonly agents = new Map<string, Agent>();
  private activeAgentId: string | null = null;

  constructor(private readonly options: AgentManagerOptions) {}

  async createAgent(id: string): Promise<Agent> {
    const existing = this.agents.get(id);
    if (existing) {
      return existing;
    }

    const agent = new Agent({
      id,
      agentsDir: this.options.agentsDir,
      productDir: this.options.productDir,
      userDir: this.options.userDir,
      cb: this.options.cb
    });

    await agent.init();
    this.agents.set(id, agent);

    if (!this.activeAgentId) {
      this.activeAgentId = id;
    }

    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  async removeAgent(id: string): Promise<boolean> {
    const agent = this.agents.get(id);
    if (!agent) {
      return false;
    }

    await agent.dispose();
    this.agents.delete(id);

    if (this.activeAgentId === id) {
      this.activeAgentId = this.agents.keys().next().value ?? null;
    }

    return true;
  }

  listAgents(): Agent[] {
    return [...this.agents.values()];
  }

  setActiveAgent(id: string): Agent {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    this.activeAgentId = id;
    return agent;
  }

  getActiveAgent(): Agent | undefined {
    return this.activeAgentId ? this.agents.get(this.activeAgentId) : undefined;
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.agents.values()].map((agent) => agent.dispose()));
    this.agents.clear();
    this.activeAgentId = null;
  }
}
