import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const projectRoot = path.resolve(import.meta.dirname, "..");
const fileUrl = `file://${path.join(projectRoot, "dist/desktop/renderer/index.html")}`;
const screenshotPath = path.join(projectRoot, "artifacts", "day4-ui.png");

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

await page.addInitScript(() => {
  const sessions = [];
  window.zhiyuan = {
    getAppMetadata: async () => ({ name: "智元Agent", version: "0.1.0" }),
    getSystemSnapshot: async () => ({ platform: "darwin", versions: {} }),
    getEngineStatus: async () => "ready",
    listModels: async () => [
      {
        providerId: "deepseek",
        providerName: "DeepSeek",
        model: "deepseek-chat",
        label: "DeepSeek Chat",
        capabilities: ["chat", "stream", "tools"]
      }
    ],
    listProviders: async () => [
      {
        id: "deepseek",
        name: "DeepSeek",
        authType: "apikey",
        compatLayer: "deepseek",
        baseURL: "https://api.deepseek.com/v1",
        envKey: "DEEPSEEK_API_KEY",
        enabled: true
      }
    ],
    listProviderConfig: async () => [{ providerId: "deepseek", apiKey: "sk-****c5a9" }],
    saveProviderConfig: async (config) => [{ ...config, apiKey: "sk-****c5a9" }],
    listSessions: async () => sessions,
    getSession: async (id) => sessions.find((session) => session.id === id) ?? null,
    createSession: async (model) => {
      const session = {
        id: "session_ui",
        title: "新会话",
        model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      };
      sessions.unshift(session);
      return session;
    },
    sendChatMessage: async (request) => {
      const session = sessions[0] ?? (await window.zhiyuan.createSession(request.model));
      const userMessage = {
        id: "msg_user",
        role: "user",
        content: request.content,
        createdAt: new Date().toISOString(),
        model: request.model
      };
      const assistantMessage = {
        id: "msg_assistant",
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        model: request.model,
        tool_calls: []
      };
      session.messages.push(userMessage, assistantMessage);

      setTimeout(
        () =>
          window.__streamCb?.({
            type: "tool_call",
            sessionId: session.id,
            messageId: assistantMessage.id,
            toolCall: {
              id: "tool_1",
              name: "web_search",
              arguments: { query: "智元Agent" },
              status: "running"
            }
          }),
        50
      );
      setTimeout(
        () =>
          window.__streamCb?.({
            type: "tool_call",
            sessionId: session.id,
            messageId: assistantMessage.id,
            toolCall: {
              id: "tool_1",
              name: "web_search",
              arguments: { query: "智元Agent" },
              status: "completed",
              result: "搜索词：智元Agent\n结果：工具调用可见。"
            }
          }),
        100
      );
      setTimeout(() => window.__streamCb?.({ type: "token", sessionId: session.id, messageId: assistantMessage.id, token: "# 标题" }), 150);
      setTimeout(
        () =>
          window.__streamCb?.({
            type: "token",
            sessionId: session.id,
            messageId: assistantMessage.id,
            token: "\n**DeepSeek** 流式回复已显示。"
          }),
        220
      );
      setTimeout(
        () =>
          window.__streamCb?.({
            type: "done",
            sessionId: session.id,
            messageId: assistantMessage.id,
            message: {
              ...assistantMessage,
              content: "# 标题\n**DeepSeek** 流式回复已显示。",
              tool_calls: [
                {
                  id: "tool_1",
                  name: "web_search",
                  arguments: { query: "智元Agent" },
                  status: "completed",
                  result: "搜索词：智元Agent\n结果：工具调用可见。"
                }
              ]
            }
          }),
        300
      );

      return { sessionId: session.id, userMessage, assistantMessage };
    },
    onStreamToken: (callback) => {
      window.__streamCb = callback;
      return () => {
        window.__streamCb = undefined;
      };
    },
    onToolCall: (callback) => {
      window.__toolCb = callback;
      return () => {
        window.__toolCb = undefined;
      };
    }
  };
});

await page.goto(fileUrl);
await page.waitForSelector("text=开始对话");
await page.selectOption("select", "deepseek:deepseek-chat");
await page.fill("textarea", "搜索 智元Agent");
await page.click('button[title="发送"]');
await page.waitForSelector("text=工具调用：web_search / completed", { timeout: 5000 });
await page.waitForSelector("text=DeepSeek", { timeout: 5000 });
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      fileUrl,
      screenshotPath,
      visible: ["开始对话", "DeepSeek Chat", "工具调用：web_search / completed", "DeepSeek 流式回复已显示"]
    },
    null,
    2
  )
);
