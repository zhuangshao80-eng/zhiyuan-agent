/// <reference types="vite/client" />

import type { ZhiYuanApi } from "../../preload";

declare global {
  interface Window {
    zhiyuan?: ZhiYuanApi;
  }
}
