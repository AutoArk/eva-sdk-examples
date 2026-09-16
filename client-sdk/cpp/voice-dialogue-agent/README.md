# EVA C++ Voice Dialogue Agent

这个 C++17 终端 demo 运行真实的
`microphone -> VAD -> ASR -> LLM -> TTS -> speaker` 链路，并演示 native AEC、Emotion、
Command、最近 10 轮对话上下文和可选 camera 图片问答。SDK 接入配置集中在 `src/sdk_usage.cpp`，
应用入口只负责参数、生命周期和退出收敛；示例不编译 EVA、ONNX Runtime 或 AEC 本身。

SDK 从 [GitHub Releases](https://github.com/AutoArk/eva-cpp-sdk-release/releases) 获取预编译包。
默认版本以 `CMakeLists.txt` 的 `EVA_SDK_VERSION` 为唯一来源（不带 `v`）；不使用 latest
或 GitHub 自动生成的 Source code 归档。

## 支持范围

| 平台 | 架构与基线 | 音频实现 | 设备选择 |
|---|---|---|---|
| macOS | Apple Silicon ARM64；已验证 macOS 26.5.1 | SDK 随包 PortAudio | 默认输入/输出设备 |
| Linux | RK3562 ARM64；Debian 11、glibc 2.31 | ALSA | 必须显式提供 capture/playback PCM 名称 |

其它系统、x86/Intel Mac、不同 glibc 或 C++ 标准库 ABI 均未验证。精确 ABI 和系统动态库依赖见
SDK 包内 `manifest.json`。

## 启动

先选择运行方式：macOS 或具备开发工具的 Linux 可直接使用下面的统一入口。精简 Linux 板机若没有
Node、CMake 或编译器，需要在兼容的 Linux ARM64 构建机编译后部署，见文末“精简 Linux 板机”。

需要 Node.js 22+、CMake 3.16+、C++17 compiler、tar 和平台系统运行库。缺少基础依赖时脚本报错，
不会自动安装系统软件。在本 example 目录运行：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- --camera
```

首次启动自动下载当前平台的 SDK 与 `.sha256`、核验摘要和 manifest、解压、配置 CMake 并编译。
后续启动复用 SDK 缓存并增量构建，修改 `src/` 后仍执行同一条命令。省略 `--camera` 就只运行语音。
Linux 首次需要按下文选择输入/输出设备并保存；之后无需重复指定。

如果 CMake 不在 PATH，可在同一条启动命令前设置 `CMAKE=/absolute/path/to/cmake`。

key 文件保存在仓库外，权限建议为 `600`，内容为：

```dotenv
EVA_GATEWAY_API_KEY=填你的真实AK
```

SDK 缓存在 `.sdk-cache/<sha256>/`，构建在 `build-managed/`，均被 Git 忽略；启动会显示实际版本、
平台、来源及摘要。已有完整缓存时不访问下载地址；更新 SDK 使用下文的统一升级命令。
下载失败或摘要错误时停止；缓存损坏时移除对应 `.sdk-cache/eva-cpp-sdk-<version>-<platform>.json`
索引和对应摘要目录，再启动重新获取。并发准备会明确报错；异常强退留下 `.prepare-lock` 时，
确认没有准备任务运行后再删除该锁目录。

只准备 SDK 和构建、无需 key：

```bash
node scripts/prepare-sdk.mjs
```

诊断参数也通过同一入口执行，`--help` 和 `--list-cameras` 不读取 key，路径可为尚不存在的文件：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- --list-cameras
```

## 本地 SDK 联调与手动 CMake 接入

仅联调本地 candidate 时，显式指定已解压 SDK，仍自动构建：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env --sdk /absolute/path/to/sdk -- --camera
```

本地与公网构建目录隔离，下一次省略 `--sdk` 会恢复公网包。

默认情况下本地包也必须匹配仓库默认版本。试用其它本地版本时显式开启覆盖：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env \
  --sdk /absolute/path/to/sdk --allow-local-version -- --camera
```

该次有效版本从本地 manifest 读取，检查与 CMake EXACT 使用同一个版本；不改仓库默认值。
manifest 格式、平台、ABI、文件完整性等校验仍执行。覆盖必须与 `--sdk` 一起使用。

手动配置仅作为进阶入口，用于已经解压且版本匹配的 SDK：

```bash
node scripts/check-env.mjs /absolute/path/to/sdk
node scripts/use-local-sdk.mjs /absolute/path/to/sdk
cmake --build build-local --parallel
./build-local/eva_voice_dialogue_agent --help
```

`check-env.mjs` 只诊断宿主、工具和 SDK 身份，不会安装软件或修改系统。`use-local-sdk.mjs` 只把
SDK CMake package 路径写入被 Git 忽略的 `build-local`，不修改公开依赖声明，也不回连 SDK 源码。
若 `cmake` 不在 `PATH`，可给两个脚本设置同一个绝对路径：

```bash
CMAKE=/absolute/path/to/cmake node scripts/check-env.mjs /absolute/path/to/sdk
CMAKE=/absolute/path/to/cmake node scripts/use-local-sdk.mjs /absolute/path/to/sdk
/absolute/path/to/cmake --build build-local --parallel
```

统一 launcher 使用 `build-managed` 中本次选中的可执行文件，不消费手动构建的 `build-local`。它只从文件映射一个 key，通过私有 stdin 交给
子进程；不会把 key 放入命令参数或输出，也不会把 key 文件中的其它变量带入进程。启动后直接说话，
按 `Ctrl+C` 停止并等待麦克风、扬声器、AEC 和 camera 释放。

## Linux 音频设备

Linux 必须选择实际可用的 ALSA PCM。若缺少查询工具，安装 `alsa-utils`。先看物理声卡及其角色，
再看可传给 SDK 的 PCM 名称：

```bash
arecord -l
aplay -l
arecord -L
aplay -L
```

当存在两三个候选时，按以下顺序判断：

1. 先确定用户实际要使用的物理 route：板载麦克风/扬声器、同一只 USB headset，还是 HDMI 输出。
2. 输入候选必须出现在 `arecord` 结果中并具备 capture 能力；输出候选必须出现在 `aplay` 结果中并
   具备 playback 能力。HDMI 通常只能作为输出，不能因为名称显眼而选作输入。
3. 同一只 USB headset 或同一块板载 codec 同时提供 capture/playback 时，优先选择相同 `CARD` 的
   输入和输出。板载麦克风与扬声器本来就分属不同 codec 时，允许选择不同 `CARD`。
4. 优先尝试 `plughw:CARD=...,DEV=...`，由 ALSA plug 处理常见格式转换。只有确认硬件原生格式完全
   匹配时才直接使用严格的 `hw:`。`default`/`sysdefault` 只有在确实映射到目标物理 route 时才选。
5. 排除 `null`；`dmix` 只考虑输出，`dsnoop` 只考虑输入；`pulse`/`pipewire` 仅在目标系统确实运行
   对应 sound server 时使用。

对每组候选先做一秒钟打开测试。下面只验证设备能以 demo 常用的 mono S16LE 范围打开，不会调用
Gateway；输出测试播放的是静音：

```bash
INPUT_PCM='plughw:CARD=YOUR_INPUT,DEV=0'
OUTPUT_PCM='plughw:CARD=YOUR_OUTPUT,DEV=0'

arecord -D "$INPUT_PCM" --dump-hw-params -f S16_LE -r 48000 -c 1 -d 1 /dev/null
aplay -D "$OUTPUT_PCM" --dump-hw-params -f S16_LE -r 44100 -c 1 -d 1 /dev/zero
```

命令返回非零、提示设备忙或格式不支持时，淘汰该候选并检查占用进程、权限或其它 PCM。若多组都
通过，AI 应先报告准备选择的 input/output、对应物理设备和理由，再让用户确认目标 route；不要仅按
列表顺序猜测。把确认可用的名称传给 demo：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- \
  --input-device "$INPUT_PCM" \
  --output-device "$OUTPUT_PCM"
```

首次确认设备后，在 `--` 前加 `--save-devices` 保存本机选择：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env --save-devices -- \
  --input-device "$INPUT_PCM" --output-device "$OUTPUT_PCM" \
  --camera --camera-device '/dev/v4l/by-id/实际设备'
```

选择保存在被 Git 忽略的 `.devices.json`。之后使用本文的一条启动命令即可；CLI 指定值优先，
只有加 `--save-devices` 才更新保存值。保存摄像头设备不会自动开启摄像头，仍需 `--camera`。

`--output-gain` 是示例输出 helper 的软件增益，范围 `0～1`，不会修改系统音量。已核验 RK3562
板可从 `--output-gain 0.5` 开始试听，其他设备应重新标定。`--aec-delay-ms` 默认 `60`，也应按实际
输入、输出 route 调整。打开测试通过只证明设备可访问；最终仍需用户确认麦克风确实收到目标声音、
扬声器 route 正确，以及开放扬声器下的 AEC 效果。

## Camera、Emotion、TTS 与 Command

无需 key 即可列出 camera：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- --list-cameras
```

macOS 输出可传给 AVFoundation 的 unique ID；Linux 输出 V4L2 路径。Linux 长期配置优先使用稳定的
`/dev/v4l/by-id` 或 `/dev/v4l/by-path`，不要把某块板的 `/dev/videoN` 写成通用默认。

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- \
  --camera \
  --camera-device ID_OR_PATH \
  --tts-model ark-tts-flash \
  --tts-voice zh_female_kido \
  --tts-sample-rate 44100
```

省略 `--camera-device` 时使用平台默认 camera。macOS 首次使用需给启动 demo 的终端授予麦克风和
摄像头权限；用途说明由 `Info.plist` 嵌入 CLI。用 `--no-emotion` 可关闭 Emotion。

demo 注册两个本地 command：说“现在几点”调用 `get_current_time`；说“打开示例指示器”调用
`set_indicator`。`--initial-playback-guard-ms` 默认 `3000`，只保护首次开场播放；传 `0` 可关闭，
后续回复仍支持插话打断。

完整参数通过统一入口查看：

```bash
node scripts/run-with-key-file.mjs /absolute/path/to/key.env -- --help
```

## 项目结构与改造入口

```text
CMakeLists.txt                 SDK 默认版本唯一声明、目标和链接依赖
Info.plist                     macOS 麦克风/摄像头用途说明
src/main.cpp                   key 输入、Agent 生命周期、信号退出和 camera 枚举
src/options.{hpp,cpp}          CLI 参数、默认值和平台约束
src/sdk_usage.{hpp,cpp}        模型、VAD、AEC、history、greeting、Emotion、camera 与 Media SPI
src/commands.{hpp,cpp}         客户业务 command schema 与 handler
src/event_output.{hpp,cpp}     事件、延迟和结构化错误输出
scripts/check-env.mjs          宿主与 SDK preflight
scripts/sdk-version.mjs        共用版本读取、显式本地版本覆盖
scripts/prepare-sdk.mjs        固定版本下载、校验、缓存与增量构建
scripts/device-config.mjs      本机设备配置与 CLI 覆盖
scripts/use-local-sdk.mjs      隔离的本地 SDK CMake 配置
scripts/run-with-key-file.mjs  凭证映射和统一启动入口
```

常见修改路径：

- 更换 ASR/LLM/TTS、system prompt、greeting、VAD 或 history：修改 `src/sdk_usage.cpp`。
- 接入真实业务工具：在 `src/commands.cpp` 替换示例 handler，并在 `src/sdk_usage.cpp` 注册。
- 接入自定义音频、AEC 或 camera：实现 SDK 的中立 Media SPI，然后替换 `MediaTransports` 中的 helper。
- 增加命令行配置：在 `src/options.*` 声明和校验，再通过 `Options` 传给 `create_agent()`。
- 对接日志系统：保留 `src/event_output.cpp` 的结构化错误字段，替换输出目的地即可。

应用必须保留 subscription 到停止完成，并等待 `stop()` 收敛后再释放 Agent。不要在 SDK 事件回调中
同步等待控制操作。

## 自动检查与人工边界

从仓库根目录运行：

```bash
node scripts/verify-catalog.mjs
node --test client-sdk/cpp/voice-dialogue-agent/scripts/*.test.mjs
```

仓库 Skill `$verify-eva-cpp-sdk-package` 会进一步核对双平台 tarball SHA、manifest 文件闭集、公共头文件、
原生二进制身份，并在匹配宿主上构建本 demo。自动 PASS 不能代替 Gateway、麦克风、TTS、开放扬声器
AEC 效果、camera 画面语义和 stop 后真实设备释放；未实际运行时只能记 `NOT_RUN`。

## 排障

- `CMake 3.16+ not found`：把 CMake 加入 `PATH`，或同时给 preflight/configure 设置绝对 `CMAKE`。
- `local SDK platform mismatch`：不要在 macOS 使用 Linux 包，或在 x86 主机使用 ARM64 包。
- `Could not find EvaClient`：确认传入的是完整解压目录，不是 output 目录或 tarball 路径。
- 下载失败：检查 GitHub Releases 网络访问；摘要错误时不要跳过校验。
- Linux 音频打开失败：重新运行 `arecord -L`/`aplay -L`，确认设备角色、权限和占用状态。
- macOS 没有声音或 camera：在系统设置中给当前终端应用授权，重启终端后再试。
- `camera.devices: none`：确认设备已连接、未被其它程序独占，并检查系统权限。
- Gateway 错误：根据输出的 `source`、`status_code` 和 `trace_id` 检查 key、模型权限和网络；不要提供 key。

会话内容只输出终端，不写音频、图片或对话文件。真实运行会向 EVA Gateway 发送语音，以及启用
camera 后当前 turn 的图片。SDK 许可以随包 `LICENSE` 为准；example 源码沿用本仓库 MIT License。

## 精简 Linux 板机

无编译器的嵌入式 Linux 板机需要在兼容的 Linux ARM64 构建环境中编译，再部署 executable、SDK
runtime 和模型资源。公网下载不消除 example 的编译要求；ADB 部署与固定 builder 属于设备联调路径。

这一路径目前没有一键部署脚本。构建机使用上述准备入口获取包并编译，部署时保留 SDK 的 runtime
与模型布局，确认动态依赖满足，再选择板机上的 ALSA PCM 与摄像头。板机无需安装 Node 即可运行
原生 executable；key 按该程序的 stdin 协议传入，不放进命令参数。设备被占用时先确认所属服务。

## 升级 SDK

从仓库根目录运行：

```bash
node scripts/update-sdk-versions.mjs --cpp <version>
```

版本必须为不带 `v` 的三段数字。命令只更新 `CMakeLists.txt` 的唯一默认声明，并运行 catalog 检查；
失败会恢复本轮修改。随后运行准备入口验证新版本的公网资产与编译兼容性，升级命令本身不证明
目标版本已发布或 API 兼容。查看当前默认版本可在 example 目录运行 `node scripts/sdk-version.mjs`。
