# Eva SDK Examples

本仓库集中维护 Eva 各 SDK 的可运行示例。示例按 SDK 产品线、实现语言和具体场景三级组织：

```text
<sdk-family>/<language>/<demo>/
```

## 示例目录

| SDK | 语言 | Demo | 说明 |
|---|---|---|---|
| Client SDK | TypeScript | [`browser-conversation-agent`](client-sdk/ts/browser-conversation-agent/) | 浏览器端语音、多轮对话、TTS、麦克风控制与可选摄像头图片问答 |

机器可读目录见 [`examples.json`](examples.json)。SDK 兼容版本以每个 demo 自己的 package manifest 和 lockfile 为唯一事实源，根目录不重复维护版本号。

## 目录约定

- `client-sdk/`：端侧 Eva SDK 示例。
- `cloud-sdk/`：云端 Eva SDK 示例。
- 第二级目录使用语言标识，例如 `ts/`、`flutter/`、`python/`。
- 第三级目录是可独立安装、构建和运行的具体 demo。
- Demo 只消费公开发布的 SDK，不通过 workspace、源码相对路径或本地 tarball 回连 SDK 仓库。
- 不提交 API Key、音频、图片、对话正文或其他用户数据。

## 本地检查

```bash
node scripts/verify-catalog.mjs
cd client-sdk/ts/browser-conversation-agent
npm ci
npm run build
```

远程仓库、CI 与静态站点部署会在代码托管地址锁定后补充。

## License

本仓库中的 example 源码使用 [MIT License](LICENSE)。各 SDK package 仍适用其各自随包分发的许可协议；本仓库的 MIT License 不改变或替代 SDK 自身许可。
