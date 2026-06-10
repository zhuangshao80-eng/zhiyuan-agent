export const APP_NAME = "智元Agent";

export interface AppMetadata {
  name: string;
  version: string;
}

export interface SystemSnapshot {
  platform: NodeJS.Platform;
  versions: NodeJS.ProcessVersions;
}
