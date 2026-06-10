import { useEffect, useRef, useState } from "react";
import {
  createHostMessage,
  isPluginAckMessage,
  isPluginReadyMessage,
  PLUGIN_IFRAME_SANDBOX
} from "../../../../lib/plugin/plugin-host-protocol";
import { t } from "../i18n";

interface PluginHostProps {
  pluginId: string;
  srcDoc: string;
  onReady?: () => void;
  onAck?: (payload: unknown) => void;
}

export function PluginHost({ pluginId, srcDoc, onReady, onAck }: PluginHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [lastAck, setLastAck] = useState<string>(t("plugin.waitStart"));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (isPluginReadyMessage(event.data, pluginId)) {
        setReady(true);
        setLastAck(t("plugin.ready"));
        onReady?.();
      }

      if (isPluginAckMessage(event.data, pluginId)) {
        setLastAck(t("plugin.ack"));
        onAck?.(event.data.payload);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAck, onReady, pluginId]);

  const pingPlugin = () => {
    iframeRef.current?.contentWindow?.postMessage(createHostMessage(pluginId, { action: "ping", at: Date.now() }), "*");
  };

  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-md border border-zinc-700 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{t("plugin.sandbox")}</div>
          <div className="text-xs text-zinc-400">{ready ? t("plugin.iframeRunning") : t("plugin.waitReady")}</div>
        </div>
        <button
          type="button"
          className="h-8 rounded-md border border-zinc-600 px-3 text-sm text-zinc-100 disabled:opacity-50"
          disabled={!ready}
          onClick={pingPlugin}
        >
          Ping
        </button>
      </div>
      <iframe
        ref={iframeRef}
        title={`plugin-${pluginId}`}
        sandbox={PLUGIN_IFRAME_SANDBOX}
        srcDoc={srcDoc}
        className="h-52 w-full rounded-md border border-zinc-800 bg-zinc-900"
      />
      <div className="text-xs text-zinc-400">{lastAck}</div>
    </section>
  );
}
