import type { ModelOption } from "../../../../shared/types";

export function ModelSelector({ models, onChange, value }: { models: ModelOption[]; onChange: (value: string) => void; value: string }) {
  return (
    <select
      className="h-9 rounded-lg border border-white/8 bg-surface-900 px-3 text-xs text-zinc-200 outline-none"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {models.map((model) => (
        <option key={`${model.providerId}:${model.model}`} value={`${model.providerId}:${model.model}`}>
          {model.label}
        </option>
      ))}
    </select>
  );
}
