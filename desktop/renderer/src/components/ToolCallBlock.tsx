import { Search } from "lucide-react";
import { memo } from "react";
import type { VisibleToolCall } from "../../../../shared/types";
import { t } from "../i18n";

function ToolCallBlockBase({ toolCall }: { toolCall: VisibleToolCall }) {
  return (
    <details className="mt-3 rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2" open>
      <summary className="flex cursor-pointer items-center gap-2 text-xs text-brand-500">
        <Search size={14} />
        {t("tool.call")}: {toolCall.name} / {toolCall.status}
      </summary>
      <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
        {JSON.stringify(toolCall.arguments, null, 2)}
      </pre>
      {toolCall.result && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-300">{toolCall.result}</p>}
    </details>
  );
}

export const ToolCallBlock = memo(ToolCallBlockBase);
