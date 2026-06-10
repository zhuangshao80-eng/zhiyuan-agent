import { Send } from "lucide-react";
import type { FormEvent } from "react";
import type { ModelOption } from "../../../../shared/types";
import { t } from "../i18n";
import { ModelSelector } from "./ModelSelector";

export function InputArea({
  input,
  isStreaming,
  models,
  onInputChange,
  onModelChange,
  onSubmit,
  selectedModel
}: {
  input: string;
  isStreaming: boolean;
  models: ModelOption[];
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  selectedModel: string;
}) {
  return (
    <form className="shrink-0 border-t border-white/8 bg-surface-950 p-4" onSubmit={onSubmit}>
      <div className="mb-3 flex items-center gap-3">
        <ModelSelector models={models} onChange={onModelChange} value={selectedModel} />
      </div>
      <div className="flex items-end gap-3">
        <textarea
          className="h-20 min-h-0 flex-1 resize-none rounded-lg border border-white/8 bg-surface-900 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/60"
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={t("chat.inputPlaceholder")}
          value={input}
        />
        <button
          className="flex size-12 items-center justify-center rounded-lg bg-white text-surface-950 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isStreaming || !input.trim()}
          title={t("chat.send")}
          type="submit"
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
}
