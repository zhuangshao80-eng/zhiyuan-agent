#!/usr/bin/env node
import http from "node:http";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { SessionCoordinator } from "../core/session-coordinator.js";

const command = process.argv[2] ?? "chat";

if (command === "serve" || command === "server") {
  await startServer(Number(readArg("--port") ?? 17810));
} else if (command === "chat") {
  await startChat(readArg("--model") ?? "deepseek:deepseek-chat");
} else {
  printHelp();
}

async function startChat(model: string): Promise<void> {
  const coordinator = new SessionCoordinator();
  const rl = readline.createInterface({ input, output });
  let sessionId: string | undefined;
  output.write(`ZhiYuan Agent CLI chat (${model}). Type /exit to quit.\n`);

  while (true) {
    const content = (await rl.question("> ")).trim();
    if (!content) continue;
    if (content === "/exit") break;
    const result = await coordinator.sendMessage({ sessionId, content, model }, (event) => {
      if (event.type === "token") output.write(event.token);
      if (event.type === "error") output.write(`\n[error] ${event.error}\n`);
      if (event.type === "done") output.write("\n");
    });
    sessionId = result.sessionId;
  }

  rl.close();
  coordinator.dispose();
}

async function startServer(port: number): Promise<void> {
  const coordinator = new SessionCoordinator();
  const server = http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === "POST" && request.url === "/chat") {
      const body = await readJson<{ sessionId?: string; content?: string; model?: string }>(request);
      const tokens: string[] = [];
      let completed = false;
      let errorMessage: string | undefined;
      let resolveStream: (() => void) | undefined;
      const streamDone = new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
      const result = await coordinator.sendMessage(
        {
          sessionId: body.sessionId,
          content: body.content ?? "",
          model: body.model ?? "deepseek:deepseek-chat"
        },
        (event) => {
          if (event.type === "token") tokens.push(event.token);
          if (event.type === "error") {
            errorMessage = event.error;
            completed = true;
            resolveStream?.();
          }
          if (event.type === "done") {
            completed = true;
            resolveStream?.();
          }
        }
      );
      await Promise.race([streamDone, new Promise((resolve) => setTimeout(resolve, 60_000))]);
      if (!completed) {
        response.statusCode = 504;
        response.end(JSON.stringify({ sessionId: result.sessionId, error: "chat response timed out" }));
        return;
      }
      if (errorMessage) {
        response.statusCode = 502;
        response.end(JSON.stringify({ sessionId: result.sessionId, error: errorMessage }));
        return;
      }
      response.end(JSON.stringify({ sessionId: result.sessionId, content: tokens.join("") }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  server.on("error", (error) => {
    output.write(`ZhiYuan Agent HTTP API failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    output.write(`ZhiYuan Agent HTTP API listening on http://127.0.0.1:${port}\n`);
  });
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function printHelp(): void {
  output.write(`Usage:
  zhiyuan chat [--model provider:model]
  zhiyuan serve [--port 17810]

Aliases:
  zhiyuan-agent chat
  zhiyuan-agent server
`);
}
