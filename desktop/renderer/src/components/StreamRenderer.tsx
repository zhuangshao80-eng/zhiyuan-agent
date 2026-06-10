export function StreamRenderer({ content }: { content: string }) {
  if (!content) {
    return <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-100"> </div>;
  }

  return <div className="space-y-2 text-sm leading-6 text-zinc-100">{renderMarkdown(content)}</div>;
}

function renderMarkdown(content: string) {
  return content.split(/\n/).map((line, index) => {
    if (line.startsWith("### ")) {
      return (
        <h3 className="text-base font-semibold text-zinc-100" key={index}>
          {renderInline(line.slice(4))}
        </h3>
      );
    }

    if (line.startsWith("## ")) {
      return (
        <h2 className="text-lg font-semibold text-zinc-100" key={index}>
          {renderInline(line.slice(3))}
        </h2>
      );
    }

    if (line.startsWith("# ")) {
      return (
        <h1 className="text-xl font-semibold text-zinc-100" key={index}>
          {renderInline(line.slice(2))}
        </h1>
      );
    }

    if (/^[-*]\s+/.test(line)) {
      return (
        <p className="pl-3 text-zinc-100" key={index}>
          <span className="mr-2 text-brand-500">•</span>
          {renderInline(line.replace(/^[-*]\s+/, ""))}
        </p>
      );
    }

    return (
      <p className="whitespace-pre-wrap text-zinc-100" key={index}>
        {renderInline(line)}
      </p>
    );
  });
}

function renderInline(line: string) {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code className="rounded bg-surface-850 px-1 py-0.5 text-xs text-brand-500" key={index}>
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong className="font-semibold text-zinc-50" key={index}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}
