# ZhiYuan Agent Release Checklist

Day 13/Day 14 release validation has a hard product gate: Windows and macOS must both build, install, and run successfully before release sign-off.

## Required Platforms

- Windows: build `npm run dist:win`, produce NSIS `.exe`, install on a clean Windows machine, launch the app, send a DeepSeek chat message, and verify session persistence after restart.
- macOS: build `npm run dist:mac`, produce `.dmg`, install on a clean macOS machine, launch the app, send a DeepSeek chat message, and verify session persistence after restart.
- Linux: build `npm run dist:linux`, produce AppImage and deb according to the V7 plan.

## Automatic Update

- Publish a test GitHub Release or self-hosted update feed.
- Install an older packaged app.
- Verify check -> available -> download -> downloaded -> install and restart.

## Evidence To Attach

- CI run URL for the three-platform matrix.
- Windows installer filename and SHA256.
- macOS DMG filename and SHA256.
- Linux artifact filenames and SHA256.
- Screenshot or log showing first app launch on Windows and macOS.
- Screenshot or log showing update flow on at least one packaged platform.
