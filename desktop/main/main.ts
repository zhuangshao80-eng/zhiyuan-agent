import { app } from "electron";
import { Engine } from "../../core/engine.js";
import { AutoUpdateService } from "./auto-updater.js";
import { registerIpcHandlers } from "./ipc.js";
import { WindowManager } from "./window-manager.js";

const windowManager = new WindowManager();
const autoUpdateService = new AutoUpdateService();
export { autoUpdateService };

if (process.env.NODE_ENV === "development") {
  process.env.VITE_DEV_SERVER_URL = "http://127.0.0.1:5173";
}

app.setName("智元Agent");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");

registerIpcHandlers(autoUpdateService);

app.whenReady().then(async () => {
  windowManager.createMainWindow();
  autoUpdateService.initialize(() => windowManager.getMainWindow());

  app.on("activate", () => {
    if (!windowManager.getMainWindow()) {
      windowManager.createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void Engine.getInstance().destroy();
});
