import { compileMemory, type CompiledMemory } from "./memory-compiler.js";

export interface MemoryTickerOptions {
  memoryDir: string;
  intervalMinutes?: number;
  masterEnabled?: boolean;
  sessionEnabled?: boolean;
  onCompiled?: (memory: CompiledMemory) => void;
  onError?: (error: Error) => void;
}

export class MemoryTicker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private masterEnabled: boolean;
  private sessionEnabled: boolean;

  constructor(private readonly options: MemoryTickerOptions) {
    this.masterEnabled = options.masterEnabled ?? true;
    this.sessionEnabled = options.sessionEnabled ?? true;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    const intervalMs = Math.max(1, this.options.intervalMinutes ?? 15) * 60_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setMasterEnabled(enabled: boolean): void {
    this.masterEnabled = enabled;
  }

  setSessionEnabled(enabled: boolean): void {
    this.sessionEnabled = enabled;
  }

  isEnabled(): boolean {
    return this.masterEnabled && this.sessionEnabled;
  }

  async tick(): Promise<CompiledMemory | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const compiled = await compileMemory({ memoryDir: this.options.memoryDir });
      this.options.onCompiled?.(compiled);
      return compiled;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
      throw normalized;
    }
  }
}
