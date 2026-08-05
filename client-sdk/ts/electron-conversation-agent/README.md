# EVA Client SDK · TypeScript Electron Conversation Agent

这是 EVA Client SDK 的 TypeScript Electron 桌面 demo，展示多轮语音对话、实时转写、TTS、麦克风控制、文本输入、emotion 旁路分类、command 调用，以及默认关闭的摄像头图片问答。

Electron 渲染进程运行在 Chromium 中，因此 demo 直接复用与浏览器 demo 相同的渲染层与 `@autoark-ai/eva-client-sdk-ts/browser` Media SPI helper。渲染进程只从 public npm package 的 `.`、`./spi` 和 `./browser` 三个公共入口导入，不依赖 SDK 源码、workspace link、internal seam 或本地 tarball。SDK 的创建与启动主路径集中在 `src/sdk-usage.ts`；`src/main.ts` 只负责页面交互、运行时 AK 输入、状态和事件展示。

Electron 主进程与预加载脚本放在独立的 `electron/` 目录：`electron/main.ts` 创建窗口、加载渲染进程并在 macOS 上申请媒体权限；`electron/preload.ts` 在启用 `contextIsolation` 的隔离世界里只暴露少量只读运行信息。主进程不参与任何 SDK 调用。

## 环境要求

- Node.js `>=22.12.0`（Electron 43 的引擎下限）
- macOS / Windows / Linux 桌面环境，并允许应用访问麦克风与摄像头
- 开发者自行管理的 EVA Gateway AK

## 项目结构

```text
electron-conversation-agent/
├── index.html            # 渲染进程页面
├── src/                  # 渲染进程：SDK 接入与页面交互（Chromium 中运行）
│   ├── main.ts           # 页面层：DOM、AK 弹窗、事件展示
│   ├── sdk-usage.ts      # SDK 创建/启动主路径
│   └── styles.css
├── electron/             # 主进程与预加载脚本（Node 中运行）
│   ├── main.ts
│   └── preload.ts
├── vite.config.ts        # 渲染进程由 Vite 构建（base: "./"）
├── tsconfig.json         # 渲染进程 TS 配置
└── tsconfig.electron.json # 主进程 / 预加载 TS 配置（编译为 CommonJS）
```

## 本地运行

先安装依赖：

```bash
npm ci
```

> Electron 运行时二进制不在 `npm ci` 阶段下载，而是在首次启动 Electron（如 `npm run dev`、`npm start`）时按当前平台/架构惰性获取并做校验，体积较大（通常上百 MB）。可用下面命令主动触发下载并验证安装：
>
> ```bash
> npx electron --version   # 首次运行会下载二进制，随后打印版本号（期望 v43.3.0）
> ```
>
> 获取失败不会静默成功，而是明确报错 `Electron failed to install correctly`。此时删除 `node_modules/electron` 后重新运行上面的命令即可重试；处于受限网络或代理环境时，可先设置官方的 `ELECTRON_MIRROR` 环境变量指向可访问的下载源，详见 [Electron 安装文档](https://www.electronjs.org/docs/latest/tutorial/installation#mirror)。

`npm run dev` 会并行启动 Vite 开发服务器并在其就绪后拉起 Electron 窗口（主进程通过 `VITE_DEV_SERVER_URL` 加载开发服务器）。

### 页面输入 AK

```bash
npm run dev
```

窗口会在启动会话时要求输入 Gateway AK。手工输入的 AK 只保存在当前渲染进程内存中，关闭窗口后清除。

### 使用项目 .env

复制示例文件、填写 AK 后启动：

```bash
cp .env.example .env
npm run dev
```

### 使用外部 key 文件

key 文件可以位于仓库外，内容为：

```dotenv
EVA_GATEWAY_API_KEY=akxxx
```

从 demo 目录启动，并传入文件路径：

```bash
npm run dev:key-file -- /absolute/path/to/eva-key.env
```

`dev:key-file` 会读取所需变量并适配当前 demo，不会复制 key 文件、生成 `.env` 或输出 AK。

仓库不得提交真实 AK。SDK 不会把 AK 写入事件、错误或消息，但桌面应用的开发者仍须自行决定最终应用如何管理凭证。

## 媒体权限

渲染进程通过 `getUserMedia` 采集麦克风与摄像头。主进程为窗口注册了 `setPermissionRequestHandler`，只放行 `media` 权限请求；在 macOS 上还会在启动时调用 `systemPreferences.askForMediaAccess` 申请系统级麦克风与摄像头授权。首次运行时请在系统弹窗中允许，否则采集会失败。

## 可选能力：Emotion 与 Command

Emotion 和 Command 是彼此独立的 opt-in 能力，也都不是基础 Agent 的必选项。省略它们不会影响文本或语音会话、ASR、LLM、TTS、摄像头以及消息历史。

| 能力 | Demo 的启用方式 | 省略配置后的行为 | 运行时事件 |
|---|---|---|---|
| Emotion | `emotion: { enabled: true, labels: ["happy", "sad"] }` | 不发起旁路 emotion 分类 | 不产生 `emotion.detected` |
| Command | `commands: { registrations, maxCallsPerTurn: 3 }` | 不向 LLM 暴露 command definitions，也不执行 handler | 不产生 `command.called`、`command.completed` 或 `command.failed` |

Demo 注册了两个可实际触发的 command：

- “现在几点？”触发 `show_current_time`，返回设备本地时间。
- “把页面切换为深色主题”触发 `set_page_theme`，将页面切换为深色；也可以要求切回浅色。

这里的 custom emotion labels 会完整替换 SDK 默认业务标签，而不是在默认集合上追加；SDK 会在缺失时自动补充唯一的 `unknown`。`AgentEvent` 在类型层始终表示完整的公共事件目录，即使某个 Agent 实例没有启用 Emotion 或 Command，使用穷尽 `switch` 的消费者仍应保留这些事件分支。

## 生产构建

```bash
npm run build   # typecheck → vite build（渲染进程）→ tsc（主进程/预加载）
npm start       # 用 Electron 加载构建产物运行
```

`vite build` 使用相对资产路径输出到 `dist/`，主进程通过 `loadFile` 直接加载 `dist/index.html`；`tsc -p tsconfig.electron.json` 将主进程与预加载脚本编译到 `dist-electron/`。本 demo 只覆盖到本地运行与构建；如需分发安装包，可在此基础上引入 electron-builder 等打包工具。

## SDK 兼容性

精确 SDK 版本由 `package.json` 与 `package-lock.json` 共同锁定。升级 SDK 时必须重新运行：

```bash
npm install @autoark-ai/eva-client-sdk-ts@<version> --save-exact
npm run build
```

升级后的 demo 需要重新完成真实桌面窗口下的麦克风、TTS、摄像头和 Stop 释放回归后，才能创建新的已验证 release/tag。
