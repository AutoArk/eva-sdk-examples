import { defineConfig } from "vite";

export default defineConfig({
  // 相对 base 同时兼容静态站点根路径和任意项目子路径部署。
  base: "./",
});
