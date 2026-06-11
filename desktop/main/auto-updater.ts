import type { BrowserWindow } from "electron";
import updater, { type ProgressInfo, type UpdateInfo } from "electron-updater";

const { autoUpdater } = updater;

export type UpdateStatus =
  | { type: "idle"; message: string }
  | { type: "checking"; message: string }
  | { type: "available"; message: string; info: UpdateInfo }
  | { type: "not-available"; message: string; info: UpdateInfo }
  | { type: "downloading"; message: string; progress: ProgressInfo }
  | { type: "downloaded"; message: string; info: UpdateInfo }
  | { type: "error"; message: string };

export class AutoUpdateService {
  private status: UpdateStatus = { type: "idle", message: "idle" };
  private getWindow: () => BrowserWindow | null = () => null;

  initialize(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.setStatus({ type: "checking", message: "checking" }));
    autoUpdater.on("update-available", (info) => this.setStatus({ type: "available", message: "available", info }));
    autoUpdater.on("update-not-available", (info) => this.setStatus({ type: "not-available", message: "not-available", info }));
    autoUpdater.on("download-progress", (progress) => this.setStatus({ type: "downloading", message: "downloading", progress }));
    autoUpdater.on("update-downloaded", (info) => this.setStatus({ type: "downloaded", message: "downloaded", info }));
    autoUpdater.on("error", (error) => this.setStatus({ type: "error", message: error.message }));
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<UpdateStatus> {
    this.setStatus({ type: "checking", message: "checking" });
    if (!autoUpdater.isUpdaterActive()) {
      this.setStatus({ type: "idle", message: "updater-inactive" });
      return this.status;
    }
    await autoUpdater.checkForUpdates();
    return this.status;
  }

  async download(): Promise<UpdateStatus> {
    await autoUpdater.downloadUpdate();
    return this.status;
  }

  install(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.getWindow()?.webContents.send("updates:status", status);
  }
}
