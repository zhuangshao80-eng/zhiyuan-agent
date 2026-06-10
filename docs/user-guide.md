# ZhiYuan Agent User Guide

## Install And Launch

Use the installer for your platform:

- Windows: run the NSIS `.exe` installer, then launch ZhiYuan Agent from the Start menu.
- macOS: open the `.dmg`, drag the app into Applications, then launch it.
- Linux: run the AppImage or install the deb package.

## First Setup

1. Open Settings.
2. Add or verify the DeepSeek provider key.
3. Choose the DeepSeek chat model.
4. Create or select an Agent.
5. Start a clean session and send a message.

## Chat

- Use the input area to send messages.
- Search requests can trigger the web-search tool.
- Tool calls appear inline and can be expanded.
- Long sessions are compacted automatically so the conversation can continue.

## Sessions

- Create, rename, delete, export, and search sessions from the sidebar.
- Restart the app to confirm session history is restored.

## Desk

- Create, edit, save, delete, and upload text files.
- Manage cron jobs from the Desk panel.

## Channels

- Create channels or DMs.
- Send messages and keep local history.

## Settings

- Manage Agents, providers, model assignments, memory, and tools.
- Switch language between zh-CN and en.
- Review usage statistics and security audit events.

## Updates

When packaged with a release feed, use Check updates from the title bar. Available updates can be downloaded and installed from the in-app notification.

## CLI

```bash
zhiyuan chat --model deepseek:deepseek-chat
zhiyuan serve --port 17810
```

HTTP server endpoints:

- `GET /health`
- `POST /chat` with JSON `{ "content": "hello", "model": "deepseek:deepseek-chat" }`
