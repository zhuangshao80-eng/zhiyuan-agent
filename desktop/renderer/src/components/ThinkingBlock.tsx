import { t } from "../i18n";

export function ThinkingBlock({ content }: { content: string }) {
  return (
    <details className="mb-3 rounded-lg border border-white/8 bg-surface-850 px-3 py-2">
      <summary className="cursor-pointer text-xs text-zinc-400">{t("thinking.title")}</summary>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{content}</p>
    </details>
  );
}
