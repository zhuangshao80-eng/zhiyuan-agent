import { memo } from "react";
import type { SessionMessage } from "../../../../shared/types";
import { t } from "../i18n";
import { StreamRenderer } from "./StreamRenderer";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

function MessageBubbleBase({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";
  const errorText = message.error ?? getLegacyErrorText(message.content);
  const isError = Boolean(errorText);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] overflow-hidden rounded-lg border px-4 py-3 ${
          isUser
            ? "border-brand-500/40 bg-brand-500/15"
            : isError
              ? "border-red-500/35 bg-red-500/10"
              : "border-white/8 bg-surface-900"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
          <span>{isUser ? t("message.you") : isError ? t("message.error") : t("message.assistant")}</span>
          {message.model && <span>{message.model}</span>}
        </div>
        {message.reasoning && <ThinkingBlock content={message.reasoning} />}
        {isError ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-red-100">{errorText}</p>
        ) : (
          <StreamRenderer content={message.content} />
        )}
        {(message.tool_calls ?? []).map((toolCall) => (
          <ToolCallBlock key={toolCall.id} toolCall={toolCall} />
        ))}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleBase, (prev, next) => JSON.stringify(prev.message) === JSON.stringify(next.message));

function getLegacyErrorText(content: string): string | undefined {
  if (content.startsWith("\u5f53\u524d\u6a21\u578b ") && content.includes("\u672c\u5730\u964d\u7ea7\u56de\u590d")) {
    return content;
  }

  if (content.startsWith("\u5bf9\u8bdd\u5931\u8d25\uff1a") || content.startsWith("LLM request failed:")) {
    return content;
  }

  return undefined;
}
