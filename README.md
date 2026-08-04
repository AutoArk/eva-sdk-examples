# EVA SDK Examples

本仓库集中维护 EVA 各 SDK 的可运行示例。示例按 SDK 产品线、实现语言和具体场景三级组织：

```text
<sdk-family>/<language>/<demo>/
```

## 示例目录

| SDK | 语言 | SDK 包 | Demo | 说明 |
|---|---|---|---|---|
| Client SDK | TypeScript | [`@autoark-ai/eva-client-sdk-ts`](https://www.npmjs.com/package/@autoark-ai/eva-client-sdk-ts) | [`browser-conversation-agent`](client-sdk/ts/browser-conversation-agent/) | 浏览器端语音、多轮对话、TTS、麦克风控制，以及可选 Emotion、Command 与摄像头图片问答 |
| Client SDK | TypeScript | [`@autoark-ai/eva-client-sdk-ts`](https://www.npmjs.com/package/@autoark-ai/eva-client-sdk-ts) | [`electron-conversation-agent`](client-sdk/ts/electron-conversation-agent/) | Electron 桌面端语音、多轮对话、TTS、麦克风控制，以及可选 Emotion、Command 与摄像头图片问答 |

机器可读目录见 [`examples.json`](examples.json)。表格链接到每个 demo 使用的 SDK package；精确版本以各 demo 的 package manifest 和 lockfile 为事实源。目录中的 `status: "release"` 表示 demo 已正式对外发布，`status: "dev"` 表示仍在开发。`verify-catalog.mjs` 会校验表格、目录与 manifest 保持一致。

## 目录约定

- `client-sdk/`：端侧 EVA SDK 示例。
- `cloud-sdk/`：云端 EVA SDK 示例。
- 第二级目录使用语言标识，例如 `ts/`、`flutter/`、`python/`。
- 第三级目录是可独立安装、构建和运行的具体 demo。
- Demo 只消费公开发布的 SDK，不通过 workspace、源码相对路径或本地 tarball 回连 SDK 仓库。
- 每个可运行 demo 都应提供只接收文件路径的 key-file 启动入口；demo 通过映射数组声明需要的变量，当前至少包含 `EVA_GATEWAY_API_KEY=<value>`，并在内存中转换为自身运行时需要的环境变量。
- 不提交 API Key、音频、图片、对话正文或其他用户数据。

## 仓库检查

```bash
node scripts/verify-catalog.mjs
node --test client-sdk/ts/browser-conversation-agent/scripts/run-npm-demo-with-key-file.test.mjs
```

各 demo 的依赖安装、运行和构建命令见其目录内的 README；根目录不重复维护具体示例的命令。

## License

本仓库中的 example 源码使用 [MIT License](LICENSE)。各 SDK package 仍适用其各自随包分发的许可协议；本仓库的 MIT License 不改变或替代 SDK 自身许可。
