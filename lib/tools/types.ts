export interface ToolExecutionContext {
  cwd?: string;
  agentDir?: string;
  parentSessionId?: string;
  access?: "readonly" | "write" | "full" | "default" | string;
  signal?: AbortSignal;
  auditLog?: {
    record: (entry: { action: string; subject: string; resource?: string; outcome: "allowed" | "denied" | "info"; detail?: string }) => Promise<unknown>;
  };
}

export interface ToolDefinition<TArgs extends object = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: TArgs, context?: ToolExecutionContext) => Promise<TResult> | TResult;
}

export type AnyToolDefinition = ToolDefinition<any, unknown>;

export interface ToolSnapshotItem {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}
