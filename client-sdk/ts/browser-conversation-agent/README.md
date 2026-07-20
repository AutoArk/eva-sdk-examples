# Eva Client SDK · TypeScript Browser Conversation Agent

这是 Eva Client SDK 的 TypeScript 浏览器 demo，展示多轮语音对话、实时转写、TTS、麦克风控制、文本输入，以及默认关闭的摄像头图片问答。

Demo 只从 public npm package 的 `.`、`./spi` 和 `./browser` 三个公共入口导入，不依赖 SDK 源码、workspace link、internal seam 或本地 tarball。SDK 的创建与启动主路径集中在 `src/sdk-usage.ts`；`src/main.ts` 只负责页面交互、运行时 AK 输入、状态和事件展示。

## 环境要求

- Node.js `>=20`
- 支持 Web Audio、麦克风和摄像头权限的现代浏览器
- 开发者自行管理的 Eva Gateway AK

## 本地运行

```bash
npm ci

# 可选：复制并编辑 .env，让开发服务器启动时读取 AK。
# 不配置时，页面会在启动会话时要求手工输入。
cp .env.example .env

npm run dev
```

手工输入的 AK 只保存在当前页面内存中，刷新页面后清除。仓库不得提交真实 AK。SDK 不会把 AK 写入事件、错误或消息，但浏览器应用的开发者仍须自行决定最终应用如何管理凭证。

## Production build

```bash
npm run build
npm run preview
```

`dist/` 是使用相对资产路径的纯静态站点，可部署到任意 HTTPS 根路径或项目子路径。公网环境中的麦克风和摄像头需要 secure context；`localhost` 可用于本地开发。

摄像头默认关闭，页面运行后可手动开启；开启期间持续持有一个 video session，每次 `speech.started` 只采一张图。可以直接说“图片里有什么”验证图片与 ASR 文本共同进入 LLM。

若 build 时提供 `VITE_EVA_API_KEY`，AK 会被 Vite 写入浏览器 bundle。公共静态部署不得设置该变量；应让使用者在运行时输入自己的可轮换、限额 AK。浏览器端凭证对页面使用者始终可观察，这不是凭证保密方案。

## SDK 兼容性

精确 SDK 版本由 `package.json` 与 `package-lock.json` 共同锁定。升级 SDK 时必须重新运行：

```bash
npm install @autoark-ai/eva-client-sdk-ts@<version> --save-exact
npm run build
```

升级后的 demo 需要重新完成真实浏览器麦克风、TTS、摄像头和 Stop 释放回归后，才能创建新的已验证 release/tag。
