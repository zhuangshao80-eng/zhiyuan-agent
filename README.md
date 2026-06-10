# 智元Agent

智元Agent（ZhiYuan Agent）是一个中文原生的桌面端 AI Agent 平台。

## Day 1 骨架

- Electron 30+ 主进程窗口管理
- Preload IPC 桥接
- React 18 + TypeScript 渲染进程
- Zustand 应用状态骨架
- Tailwind CSS 暗色主题
- 自动更新服务占位

## 启动

```bash
npm install
npm run dev
```

如果本机没有全局 Node，请使用项目自带 Node：

```bash
cd /Users/a1/Documents/智元agent/zhiyuan-agent
./npm start
```

也可以双击 `start-local.command` 启动生产版 Electron。

## 验收命令

```bash
npm install
npx tsc --noEmit
npm run typecheck
npm run dev
```

默认 Agent 配置位于 `agents/default/config.yaml`，由 `core/agent.ts` 按 Agent id 派生路径加载。
