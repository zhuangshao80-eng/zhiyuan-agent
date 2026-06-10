import { BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "../../shared/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePreloadPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), "desktop/preload/index.cjs");
  }

  return path.join(__dirname, "../preload/index.cjs");
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 960,
      minHeight: 640,
      title: APP_NAME,
      backgroundColor: "#101113",
      titleBarStyle: "hiddenInset",
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      void this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      void this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}
