# EVA Client SDK · TypeScript Browser Conversation Agent

这是 EVA Client SDK 的 TypeScript 浏览器 demo，展示多轮语音对话、实时转写、TTS、麦克风控制、文本输入、emotion 旁路分类、command 调用，以及默认关闭的摄像头图片问答。

Demo 只从 public npm package 的 `.`、`./spi` 和 `./browser` 三个公共入口导入，不依赖 SDK 源码、workspace link、internal seam 或本地 tarball。SDK 的创建与启动主路径集中在 `src/sdk-usage.ts`；`src/main.ts` 只负责页面交互、运行时 AK 输入、状态和事件展示。

## 环境要求

- Node.js `>=22`
- 支持 Web Audio、麦克风和摄像头权限的现代浏览器
- 开发者自行管理的 EVA Gateway AK

## 本地运行

先安装依赖：

```bash
npm ci
```

### 页面输入 AK

直接启动开发服务器：

```bash
npm run dev
```

页面会在启动会话时要求输入 Gateway AK。手工输入的 AK 只保存在当前页面内存中，刷新页面后清除。

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

### 指定端口

两种命令都可以把 `--port` 传给 Vite：

```bash
npm run dev -- --port 4173
npm run dev:key-file -- /absolute/path/to/eva-key.env --port 4173
```

仓库不得提交真实 AK。SDK 不会把 AK 写入事件、错误或消息，但浏览器应用的开发者仍须自行决定最终应用如何管理凭证。

## 可选能力：Emotion 与 Command

Emotion 和 Command 是彼此独立的 opt-in 能力，也都不是基础 Agent 的必选项。省略它们不会影响文本或语音会话、ASR、LLM、TTS、摄像头以及消息历史。

| 能力 | Demo 的启用方式 | 省略配置后的行为 | 运行时事件 |
|---|---|---|---|
| Emotion | `emotion: { enabled: true, labels: ["happy", "sad"] }` | 不发起旁路 emotion 分类 | 不产生 `emotion.detected` |
| Command | `commands: { registrations, maxCallsPerTurn: 3 }` | 不向 LLM 暴露 command definitions，也不执行 handler | 不产生 `command.called`、`command.completed` 或 `command.failed` |

Demo 主动启用这两项，是为了让 public npm package 的消费者构建和真实浏览器回归能够覆盖对应契约，不表示一般接入必须照搬。

这里的 custom emotion labels 会完整替换 SDK 默认业务标签，而不是在默认集合上追加；SDK 会在缺失时自动补充唯一的 `unknown`。Emotion 分类是旁路能力，不参与正常 reply、history、messages 或 TTS 控制。

Command 只能在构造 Agent 时通过 definition 与 handler 成对注册。`command.called` 表示 handler 已承诺入场，`command.completed` 表示返回成功结果，`command.failed` 表示 handler 返回业务失败或执行失败；最终自然语言回复仍由 LLM 根据 command 结果生成。

`AgentEvent` 在类型层始终表示完整的公共事件目录。即使某个 Agent 实例没有启用 Emotion 或 Command，使用穷尽 `switch` 的消费者仍应保留这些事件分支，以便 SDK 升级时由 TypeScript 检查事件处理是否完整。

## Production build

```bash
npm run build
npm run preview
```

`dist/` 是使用相对资产路径的纯静态站点，可部署到任意 HTTPS 根路径或项目子路径。公网环境中的麦克风和摄像头需要 secure context；`localhost` 可用于本地开发。

摄像头默认关闭，页面运行后可手动开启；开启期间持续持有一个 video session，每次 `speech.started` 只采一张图。可以直接说“图片里有什么”验证图片与 ASR 文本共同进入 LLM。

Demo 注册了两个可实际触发的 command：

- “现在几点？”触发 `show_current_time`，返回浏览器所在设备的本地时间。
- “把页面切换为深色主题”触发 `set_page_theme`，将页面切换为深色；也可以要求切回浅色。

触发后，诊断信息中的 Command 行和状态日志应依次显示 `command.called` 与 `command.completed`；handler 返回业务失败时显示 `command.failed`。这三个事件只说明 command handler 的执行结果，最终自然语言回复仍由 LLM 生成。

通过 `dev:key-file` 或 build 环境提供 `VITE_EVA_API_KEY` 时，AK 会被 Vite 写入浏览器 bundle。公共静态部署不得注入共享 AK；应让使用者在运行时输入自己的可轮换、限额 AK。浏览器端凭证对页面使用者始终可观察，这不是凭证保密方案。

## SDK 兼容性

精确 SDK 版本由 `package.json` 与 `package-lock.json` 共同锁定。升级 SDK 时必须重新运行：

```bash
npm install @autoark-ai/eva-client-sdk-ts@<version> --save-exact
npm run build
```

升级后的 demo 需要重新完成真实浏览器麦克风、TTS、摄像头和 Stop 释放回归后，才能创建新的已验证 release/tag。
