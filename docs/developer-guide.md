# ZhiYuan Agent Developer Guide

## Project Layout

- `core/`: lifecycle, Agent, model resolution, sessions, plugins, skills, security, usage, compaction.
- `lib/`: tools, memory, persona, bridge, desk, channels, settings, i18n.
- `desktop/main`: Electron main process and IPC.
- `desktop/preload`: safe renderer bridge.
- `desktop/renderer`: React UI.
- `cli/`: terminal client and local HTTP API.
- `scripts/`: verification scripts.

## Local Commands

```bash
./npm install
./npm run typecheck
./npm run build
./npm start
```

No global Node is required when using the repository wrapper scripts.

## Packaging

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Release artifacts are written to `release/`. Windows and macOS artifacts are release blockers and must be installed and launched on clean machines before sign-off.

## Automatic Updates

The app uses `electron-updater` through `desktop/main/auto-updater.ts`.

Required release validation:

1. Install an older packaged version.
2. Publish a newer release with update metadata.
3. Verify check, download, install, and restart.

## Security

Audit events are written as JSONL. Sensitive user actions, provider changes, Desk writes, cron changes, plugin/skill operations, bridge sends, and high-risk tools should emit audit records.

## Performance

Keep these targets for packaged builds:

- Cold start under 3 seconds.
- First screen under 2 seconds.
- Idle memory under 200 MB.

Use packaged Windows and macOS builds for final numbers.

## Verification

```bash
./.local-node/bin/node scripts/verify-day13.mjs
./.local-node/bin/node scripts/verify-day12.mjs
./.local-node/bin/node scripts/verify-day11.mjs
```

These scripts verify code paths and configuration. They do not replace install-and-run validation on Windows and macOS.
