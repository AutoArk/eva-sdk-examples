# EVA Client SDK · Flutter Conversation Agent

这是 EVA Client SDK 的 Flutter mobile demo，展示实时语音对话、转写与回复、TTS、麦克风控制、摄像头图片问答、Emotion、Command、文本输入以及会话 stop/restart。

Demo 依赖 pub.dev 上的 `autoark_eva_client_sdk`（精确版本见 `pubspec.yaml`），不依赖 SDK 源码仓库。SDK 创建主路径集中在 [`lib/sdk_usage.dart`](lib/sdk_usage.dart)；[`lib/demo_controller.dart`](lib/demo_controller.dart) 只管理会话与 UI 状态，[`lib/demo_app.dart`](lib/demo_app.dart) 只负责页面展示。接入方可以先阅读 `sdk_usage.dart`，再按自己的产品替换 UI。

## 环境要求

- Flutter / Dart 版本满足 `pubspec.yaml`
- Android API 24+、arm64 设备或模拟器
- iOS 15.1+、arm64 真机或 Apple Silicon arm64 Simulator
- Java 17（Android 构建）
- Android/iOS 麦克风与摄像头 runtime permission
- 开发者自行管理的 EVA Gateway AK

## 安装、构建与启动

下面的命令会做不同的事情；先按目标选择，避免把“生成产物”和“启动 app”混为一谈。

| 目标 | 命令 | 会重新构建 app | 会安装/启动 app |
|---|---|---:|---:|
| 准备或切换依赖后解析制品 | `flutter pub get` | 否 | 否 |
| 本机开发（内置 AK） | key-file launcher | 是 | 是 |
| 本机开发（运行时输入 AK） | `flutter run -d <device-id>` | 是 | 是 |
| 生成 Android release APK | Android build script | 是 | 否 |
| 生成 iOS release app | `flutter build ios --release` | 是 | 否 |
| 使用已有 release 产物 | `adb install` / `devicectl install` / `devicectl launch` | 否 | 安装或启动 |

### 1. 准备依赖

先按 committed lockfile 解析并安装公开制品；该命令不构建或启动 app：

```bash
flutter pub get
```

### 2. 本机开发：构建、安装并启动

以下两种开发启动方式都会调用 `flutter run`：Flutter 会为目标设备构建（通常可增量构建）、安装并启动 app，而不是复用某个已有 APK 或 `.app`。

#### 内置 AK：本地测试（推荐）

本地测试优先使用内置 AK（key file）模式，减少用户在 app 内手动输入 AK 的操作；skill/自动化流程可通过该 key-file 路径调用 AK。

key file 保存在仓库外，至少包含：

```dotenv
EVA_GATEWAY_API_KEY=<value>
```

从 demo 目录启动：

```bash
node scripts/run-flutter-demo-with-key-file.mjs /absolute/path/to/key-file -d <device-id>
```

launcher 只读取声明的变量，不执行 key file 内容，也不打印 AK。它把所需值写入权限为 `0600` 的临时 JSON，作为本次 `flutter run` 的 `--dart-define-from-file` 输入，并在进程退出后删除。AK 会作为 Dart compile-time define 进入这次构建的产物；即使是 release 产物，内置 AK 也可能被逆向提取，因此这种模式只适合受控的本地/内部测试，不能作为凭证保密或公开分发方案。

#### 不内置 AK：运行时输入

没有本地 AK 时，直接开发运行：

```bash
flutter run -d <device-id>
```

这次构建的 app 不包含 Gateway AK。app 启动后会显示遮罩输入框；输入 AK 并点击“使用 AK 并开始”后才创建 Agent 和启动语音会话。运行时输入的 AK 不参与构建，只保存在当前 app 进程内，不写文件、不进入事件或诊断信息；stop/restart 会在本次进程中继续使用，彻底关闭 app 后需要重新输入。

### 3. 生成 release 交付产物

需要将 app 交付给他人安装，或脱离开发环境演示时，生成 **release** 产物。以下构建命令只生成产物，不会安装或启动 app；release 构建需要几分钟是正常的编译耗时。

Android：

```bash
node scripts/build-android-demo.mjs --release                                  # 不带 AK
node scripts/build-android-demo.mjs --release --key-file /绝对路径/to/key-file # 带 AK
```

产物在 `build/app/outputs/flutter-apk/app-release.apk`。无 `--key-file` 时，app 启动后会要求运行时输入 AK；带 `--key-file` 时，AK 会进入该 APK，限受控测试使用。

iOS（需先完成下方「iOS 真机注意事项」的签名配置）：

```bash
flutter build ios --release
```

产物在 `build/ios/iphoneos/Runner.app`（不带 AK，启动后输入 AK）。

带 AK 的 iOS release 目前走 key-file launcher 的 release 模式：

```bash
node scripts/run-flutter-demo-with-key-file.mjs /绝对路径/to/key-file -d <device-id> --release
```

这条命令会通过 `flutter run --release` 重新构建、安装并启动，并非使用已有 `Runner.app`。新版 Flutter 可能报 `expected app not found`（产物实际在 `build/ios/Release-iphoneos/`）；遇到时退回上面的不带 AK `flutter build ios --release` + 下方 `devicectl` 安装流程，并在 app 内运行时输入 AK。

### 4. 安装或启动已有 release 产物

Android 安装已有 APK（不会重新构建；完成后从设备桌面打开 app）：

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

iOS 安装并启动已有 `Runner.app`（不会重新构建）：

```bash
xcrun devicectl device install app --device <device-id> build/ios/iphoneos/Runner.app
xcrun devicectl device process launch --device <device-id> ai.autoark.eva.examples.evaFlutterConversationAgent
```

### 运行时行为与错误可见性

app 启动时会申请麦克风与相机权限（Android 对应 `RECORD_AUDIO` 和 `CAMERA`，iOS 在系统弹窗中授权）。麦克风、TTS 默认开启，camera 默认关闭，可在页面中切换。可以说"现在几点"触发 `get_current_time`，或要求按指定称呼和语气问候以触发 `format_greeting`；Command 和 Emotion 结果会出现在 event timeline。

`error` 事件会在 event timeline 展示 SDK 提供的完整脱敏公共诊断视图。Gateway 错误包括 `source`、具体阶段 `provider`（如 `asr` / `llm` / `tts`）、HTTP `statusCode`、安全 `message`、`fatal`，以及 Gateway 返回时的可选 `traceId`。例如：

```text
error · turn-1
source: gateway
provider: asr
statusCode: 401
message: Gateway request failed with status 401: unauthorized
fatal: true
traceId: trace-safe-401
```

`traceId` 仅用于关联 Gateway 日志；机器分类仍应使用 `source`、`provider` 与 `statusCode`。Demo 不显示原始 Gateway 响应、AK、Bearer token 或原生堆栈。

验证结束后应卸载带 AK 的测试 app 并清理本地 build 输出。无论使用哪种模式，都不要把 AK 写进源码、manifest、lockfile 或 Git。

## iOS 真机注意事项

iOS 真机特有的注意事项集中放在这里：签名、首次安装与分发。

**签名**

iOS 真机构建必须经过代码签名，签名用的证书与 Team 归属于每个开发者自己的 Apple 账号。**证书和签名配置不会、也不应提交到仓库或与他人共享**：仓库默认不内置 `DEVELOPMENT_TEAM`，每个开发者用自己的账号即可在本机真机上构建运行。

前置：Mac 装有 Xcode，并已用你的 Apple ID 登录 Xcode（`Xcode → Settings → Accounts`）。

自动签名（推荐）：

1. 用 Xcode 打开 `ios/Runner.xcworkspace`；
2. 选中 **Runner** target → **Signing & Capabilities**；
3. 勾选 **Automatically manage signing**，Team 下拉选择你的团队（免费个人团队即可，仅用于跑自己的设备）。

命令行方式：编辑 `ios/Runner.xcodeproj/project.pbxproj`，在 Runner 的 Debug / Release / Profile 三个构建配置里设置：

```xcconfig
DEVELOPMENT_TEAM = <你的Team ID>;
```

Team ID 取开发者证书 subject 的 **OU 字段**（证书 CN 显示名括号里的值不一定是 Team ID，以 OU 为准）：

```bash
security find-certificate -c "Apple Development: <你的Apple ID邮箱>" -p | openssl x509 -noout -subject
```

**首次安装**

如提示"未受信任的开发者"，到 `设置 → 通用 → VPN 与设备管理` 信任该开发者后再打开。免费个人团队的 profile 约 7 天过期，Xcode 重新构建时自动重新生成，无需手动处理。

**分发给他人**

免费个人团队**只能**运行在自己已注册的设备（上限 3 台），**无法分发**给其他用户。需要把 app 给外部用户安装时，请升级付费 Apple Developer Program（$99/年），通过 **TestFlight**（外部测试最多 10000 人，无需收集设备 UDID）或 **Ad Hoc**（最多 100 台，需收集对方 UDID）分发。

## SDK 接入主路径

[`lib/sdk_usage.dart`](lib/sdk_usage.dart) 连续展示了消费者通常最关心的部分：

1. 从应用配置接收 Gateway AK 与 ASR/LLM/TTS model；
2. 通过 `EvaAgentConfig` 组合 ASR、LLM、TTS；
3. 配置 system prompt、static greeting 和业务 metadata；
4. opt-in 开启 Emotion，并注册两个无外部副作用的 Command；
5. 通过 `createDefaultEvaMediaTransports` 显式构造 SDK 默认 SPI 实现并注入 `transports`；
6. 通过 `EvaAgent` 的 `events`、`start()`、media toggles、`submitText()`、`getMessages()` 和 `stop()` 驱动产品 UI。

核心配置形状如下，完整可运行代码以 `sdk_usage.dart` 为准：

```dart
final EvaAgent agent = EvaAgent.create(
  EvaAgentConfig(
    apiKey: config.apiKey,
    asr: EvaAsrConfig(model: config.asrModel, sampleRate: 16000),
    llm: EvaLlmConfig(
      model: config.llmModel,
      extraParameters: const <String, Object?>{
        'thinking': <String, Object?>{'type': 'disabled'},
      },
    ),
    tts: EvaTtsConfig(
      model: config.ttsModel,
      voice: 'zh_en_male_evan',
      sampleRate: 44100,
    ),
    transports: createDefaultEvaMediaTransports(
      camera: const EvaDefaultCameraOptions(
        maxLongEdge: 640,
        jpegQuality: 70,
      ),
    ),
    vad: const EvaVadConfig(
      sensitivity: 0.7,
      silenceThresholdMs: 400,
    ),
    history: const EvaHistoryConfig(maxTurns: 10),
    camera: const EvaCameraConfig(captureTimeoutMs: 1500),
    bargeIn: const EvaBargeInConfig(initialPlaybackGuardMs: 3000),
    systemPrompt: demoSystemPrompt,
    greeting: const EvaStaticGreeting('你好，我是 EVA，很高兴认识你。'),
    emotion: EvaEmotionConfig(enabled: true),
    commands: EvaCommandsConfig(
      registrations: demoCommands,
      maxCallsPerTurn: 3,
    ),
  ),
);
```

`agent.start()` 不会自动打开媒体。Demo 在 start 后按当前页面开关调用 `setAudioInputEnabled()`、`setCameraEnabled()` 与 `setTtsEnabled()`；`stop()` 负责收束当前 session。重启会话会创建新的 Agent，不复用已经 stop 的实例。

## 可选能力：Emotion 与 Command

| 能力 | Demo 的启用方式 | 省略配置后的行为 | 运行时事件 |
|---|---|---|---|
| Emotion | `EvaEmotionConfig(enabled: true)` | 不运行旁路分类 | 不产生 `emotion.detected` |
| Command | `EvaCommandsConfig(registrations: ..., maxCallsPerTurn: 3)` | 不向 LLM 暴露 definitions，也不执行 handler | 不产生 `command.called/completed/failed` |

Emotion 和 Command 彼此独立，也都不是基础语音/文本会话的必选项。Demo 主动启用它们是为了展示公开 SDK 能力，不表示每个产品都必须照搬。Command handler 在 Dart 应用进程中执行；最终自然语言回复仍由 LLM 根据 command result 生成。

## 显式切换到本地 SDK

默认模式始终消费 pub.dev。需要联调尚未发布的 SDK checkout 或 candidate 时，传入该 checkout 中 `flutter/` package 的绝对路径：

```bash
node scripts/use-local-sdk.mjs /absolute/path/to/autoark-eva-client-sdk/flutter
flutter pub get
```

脚本只生成被 Git 忽略的 `pubspec_overrides.yaml`，不会改动 `pubspec.yaml`。该 override 位于 Dart package resolution 层，不绑定平台；Android 与 iOS 均使用同一条命令和同一份 UI。恢复公开制品：

```bash
node scripts/use-local-sdk.mjs --registry
flutter pub get
```

提交前应恢复 registry mode，并运行根目录 catalog checker。它会拒绝本地 override、源码路径 lock、被误迁入的 `integration_test/` 和非 pub.dev SDK 来源。

## 自动检查与人工边界

下列 `flutter build` 与 Android build script 都会重新编译，但只用于验证构建产物，不会安装或启动 app：

```bash
flutter test
flutter analyze
flutter build apk --debug
flutter build apk --release
# 同时验证有/无 AK 的统一构建入口
node scripts/build-android-demo.mjs
node scripts/build-android-demo.mjs --key-file /absolute/path/to/key-file
node --test scripts/*.test.mjs
node ../../../scripts/verify-catalog.mjs
```

自动检查证明公开 package 可解析、Dart UI/controller 行为、平台编译和依赖泄漏边界。真实 Gateway、麦克风、扬声器听感、系统 audio route/AEC、camera 画面与 stop 后设备资源释放仍需目标真机人工验收。

## SDK 兼容性

精确版本由 `pubspec.yaml` 和 `pubspec.lock` 共同锁定。升级时修改 exact version、重新运行 `flutter pub get`，并完成上述自动检查和目标设备回归；也可用根目录统一入口 `node scripts/update-sdk-versions.mjs --flutter <version>` 更新。`autoark_eva_client_sdk` 同时支持 Android 与 iOS；Android 最低 API 24，iOS 最低 15.1，支持 arm64 真机与 Apple Silicon arm64 Simulator。

## License

Demo 源码适用仓库根目录 [MIT License](../../../LICENSE)。`autoark_eva_client_sdk` 仍适用其随 pub package 分发的许可协议。
