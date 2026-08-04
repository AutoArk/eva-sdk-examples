import { app, BrowserWindow, session, systemPreferences } from "electron";
import path from "node:path";

/**
 * Electron 主进程。
 *
 * 只负责创建窗口、加载渲染进程（dev 用 Vite 开发服务器，生产加载 vite build 产物），
 * 以及在 macOS 上向系统申请麦克风/摄像头权限并对渲染进程的媒体权限请求放行。
 * EVA 会话本身完全运行在渲染进程里（见 src/sdk-usage.ts），主进程不参与 SDK 调用。
 */

// dev 模式由 npm run dev 注入；生产构建下为 undefined，改为加载本地 dist。
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 960,
    height: 860,
    minWidth: 480,
    minHeight: 640,
    backgroundColor: "#0b0b10",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // 渲染进程需要 getUserMedia 采集麦克风/摄像头，沙箱下仍可用。
      sandbox: true,
    },
  });

  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

async function requestMediaAccess(): Promise<void> {
  // macOS 首次采集前需要显式申请系统权限，否则 getUserMedia 会静默失败。
  if (process.platform !== "darwin") return;
  try {
    await systemPreferences.askForMediaAccess("microphone");
    await systemPreferences.askForMediaAccess("camera");
  } catch {
    // 用户拒绝时继续启动；渲染进程会在 error 事件里反映不可用状态。
  }
}

void app.whenReady().then(async () => {
  // 放行渲染进程发起的 media（麦克风/摄像头）权限请求，其余一律拒绝。
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  await requestMediaAccess();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
