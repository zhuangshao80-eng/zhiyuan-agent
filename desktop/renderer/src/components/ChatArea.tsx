import { Bot } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { SessionMessage } from "../../../../shared/types";
import { t } from "../i18n";
import { MessageBubble } from "./MessageBubble";

export function ChatArea({ error, isStreaming, messages }: { error: string | null; isStreaming: boolean; messages: SessionMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleMessages = useMemo(() => (messages.length > 160 ? messages.slice(-120) : messages), [messages]);
  const hiddenCount = messages.length - visibleMessages.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [error, isStreaming, messages]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" ref={scrollRef}>
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-xl text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl border border-white/10 bg-surface-850">
              <Bot size={32} className="text-brand-500" />
            </div>
            <h2 className="text-2xl font-semibold tracking-normal">{t("chat.start")}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {t("chat.emptyHint")}
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {hiddenCount > 0 ? <p className="text-center text-xs text-zinc-500">{t("chat.virtualized", { count: visibleMessages.length })}</p> : null}
          {visibleMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && <p className="text-xs text-zinc-500">{t("chat.streaming")}</p>}
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        </div>
      )}
    </div>
  );
}

export const MemoizedChatArea = memo(ChatArea);
