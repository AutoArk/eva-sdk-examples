import { defineConfig } from "vite";

export default defineConfig({
  // 相对 base 让 vite build 产物使用相对资产路径，Electron 主进程可以直接
  // 通过 loadFile 加载 dist/index.html，而不依赖任何服务器根路径。
  base: "./",
});
