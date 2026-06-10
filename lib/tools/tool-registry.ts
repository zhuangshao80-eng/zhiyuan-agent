import type { LlmToolDefinition } from "../../shared/types.js";
import type { AnyToolDefinition, ToolSnapshotItem } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();
  private readonly disabled = new Set<string>();

  constructor(tools: AnyToolDefinition[] = [], disabled: string[] = []) {
    tools.forEach((tool) => this.register(tool));
    disabled.forEach((name) => this.disable(name));
  }

  register(tool: AnyToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    this.disabled.delete(name);
    return this.tools.delete(name);
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }

  listEnabled(): AnyToolDefinition[] {
    return this.list().filter((tool) => this.isEnabled(tool.name));
  }

  enable(name: string): void {
    this.disabled.delete(name);
  }

  disable(name: string): void {
    this.disabled.add(name);
  }

  isEnabled(name: string): boolean {
    return this.tools.has(name) && !this.disabled.has(name);
  }

  setDisabled(names: string[]): void {
    this.disabled.clear();
    names.forEach((name) => this.disable(name));
  }

  snapshot(): ToolSnapshotItem[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      enabled: this.isEnabled(tool.name)
    }));
  }

  toLlmTools(): LlmToolDefinition[] {
    return this.listEnabled().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
}

export function toolToLlmDefinition(tool: AnyToolDefinition): LlmToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}
