import { contextBridge } from "electron";

/**
 * 预加载脚本，在启用 contextIsolation 的隔离世界里运行。
 *
 * 本 demo 的渲染进程直接通过公开 SDK 与 EVA 通信，不需要主进程特权能力，
 * 因此这里只暴露少量只读的运行环境信息。如果后续渲染进程需要访问主进程能力，
 * 在这里通过 contextBridge 显式、最小化地暴露，而不是打开 nodeIntegration。
 */
contextBridge.exposeInMainWorld("evaElectron", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
