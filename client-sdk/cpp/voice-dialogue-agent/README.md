# EVA C++ Voice Dialogue Agent

普通 C++17 命令行语音对话工程，使用 EVA 预编译动态库、native AEC、Emotion 和两个通用 command：
`get_current_time` 读取时间，`set_indicator` 修改进程内示例开关。相机通过 `--camera` 按需开启。
不在示例中编译 EVA、ORT 或 AEC，不需要 `.app` 或自行维护 Apple 事件循环。
示例显式向 LLM 提供最近 10 轮完整问答作为上下文；会话消息快照仍独立保留。

当前状态为 dev：C++ SDK 首发 Release 尚未发布，本工程先用于已核验候选包联调，不能据此宣称公开安装已验证。
SDK 版本以 `CMakeLists.txt` 的精确 `find_package` 要求为准。正式下载渠道为 GitHub Releases；发布后补充实际下载链接。
SDK 许可以其随包 LICENSE 为准；本示例源码沿用示例仓 MIT License。

## 构建

需要 CMake、C++17 编译器和对应平台完整 SDK 包。支持范围与系统运行库见 SDK 随包 README/manifest。
只使用与本机架构、系统和标准库匹配的候选。Linux 首发为 RK3562 / Debian 11 / ARM64；Mac 为已验证的 Apple Silicon / macOS 26.5.1。

在示例目录运行：

```sh
node scripts/use-local-sdk.mjs /absolute/path/to/installed-sdk
cmake --build build-local
```

此本地入口只在被 Git 忽略的 `build-local` 记录安装路径，不改公开依赖声明，不回连 SDK 源码。
已安装正式包也可用标准 `cmake -S . -B build -DEvaClient_DIR=/absolute/sdk/lib/cmake/EvaClient`，
Mac 同时按包 manifest 设置 `CMAKE_OSX_DEPLOYMENT_TARGET`；然后 `cmake --build build`。
构建后可先运行 `build-local/eva_voice_dialogue_agent --help`，无需 key 或设备。

## 运行

准备仓外权限受限的文本文件，含一行 `EVA_GATEWAY_API_KEY=...`。启动器只读取该变量，通过私有 stdin
传给子进程；不把 key 放进命令参数或输出，也不将其它文件变量导入进程。

Mac 使用系统默认输入和输出设备：

```sh
node scripts/run-with-key-file.mjs /absolute/path/to/key.env "$PWD/build-local/eva_voice_dialogue_agent"
```

Linux 需指定实际核验的 ALSA 输入与输出名称：

```sh
node scripts/run-with-key-file.mjs /absolute/path/to/key.env "$PWD/build-local/eva_voice_dialogue_agent" \
  --input-device YOUR_CAPTURE_PCM --output-device YOUR_PLAYBACK_PCM
```

`--output-gain` 设置输出 helper 的软件音量，范围 `0～1`，默认 `1`，不修改系统音量。已核验 RK3562 板的试听配置追加 `--output-gain 0.5`；Mac 保持默认，不将该板的调音值推广到其他设备。需要支持该选项的新 SDK 构建，旧候选包需更新后重新编译。

example 默认设置 `--initial-playback-guard-ms 3000`，首次播放开始后的 3 秒内不接纳语音起声，避免开场白初段被残余回声打断；传 `0` 可关闭。该窗口只作用于首次播放，不阻止后续回复期间的正常插话。

增加 `--camera` 开启相机；可用 `--camera-device ID_OR_PATH` 选择 Mac unique ID 或 Linux 设备路径。
Linux 应传运行时确认的稳定 `/dev/v4l/by-id` 或 `/dev/v4l/by-path` 路径，不把板级节点作为通用默认。
Mac 可省略相机 ID 使用系统默认摄像头，首次使用需允许麦克风/摄像头权限；用途说明已嵌入 CLI。

相机在会话启动前启用，开场白期间可以预热；后续语音才触发拍照，ready 不保证曝光完成。
请说话开始对话，可问“现在几点”或“打开示例指示器”；回复播放中继续说话可打断。按 Ctrl+C 停止并释放设备。
会话内容只输出终端，不写音频、图片或对话文件。实际运行会向 EVA Gateway 发送语音，以及启用相机后的图片。

## 验证边界

本地候选安装、双平台编译和无凭证参数检查与真实 Gateway/设备验收分开记录。`--help` 成功不能证明录音、
图片质量或 AEC 效果；目标设备应重新核验音频路由、权限、首拍及资源释放。
