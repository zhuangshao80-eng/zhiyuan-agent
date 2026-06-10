export const PLUGIN_IFRAME_SANDBOX = "allow-scripts allow-forms";

export interface PluginReadyMessage {
  type: "plugin:ready";
  pluginId: string;
}

export interface PluginAckMessage {
  type: "plugin:ack";
  pluginId: string;
  payload: unknown;
}

export interface PluginHostMessage {
  type: "host:message";
  pluginId: string;
  payload: unknown;
}

export function createHostMessage(pluginId: string, payload: unknown): PluginHostMessage {
  return { type: "host:message", pluginId, payload };
}

export function createSamplePluginHtml(pluginId: string, title = "ZhiYuan Plugin"): string {
  const safePluginId = escapeHtml(pluginId);
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; background: #101316; color: #eef2f6; font: 14px system-ui, sans-serif; }
    main { padding: 16px; display: grid; gap: 10px; }
    code { color: #70d6b5; }
  </style>
</head>
<body>
  <main>
    <strong>${safeTitle}</strong>
    <span>插件沙箱已启动：<code>${safePluginId}</code></span>
    <output id="last-message">等待宿主消息</output>
  </main>
  <script>
    const pluginId = ${JSON.stringify(pluginId)};
    const output = document.getElementById("last-message");
    window.parent.postMessage({ type: "plugin:ready", pluginId }, "*");
    window.addEventListener("message", (event) => {
      output.textContent = "收到宿主消息：" + JSON.stringify(event.data);
      window.parent.postMessage({ type: "plugin:ack", pluginId, payload: event.data }, "*");
    });
  </script>
</body>
</html>`;
}

export function isPluginReadyMessage(value: unknown, pluginId?: string): value is PluginReadyMessage {
  return isRecord(value) && value.type === "plugin:ready" && typeof value.pluginId === "string" && (!pluginId || value.pluginId === pluginId);
}

export function isPluginAckMessage(value: unknown, pluginId?: string): value is PluginAckMessage {
  return isRecord(value) && value.type === "plugin:ack" && typeof value.pluginId === "string" && (!pluginId || value.pluginId === pluginId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}
