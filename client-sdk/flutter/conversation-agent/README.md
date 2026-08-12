# EVA Client SDK · Flutter Conversation Agent

这是 EVA Client SDK 的 Flutter mobile demo，展示实时语音对话、转写与回复、TTS、麦克风控制、摄像头图片问答、Emotion、Command、文本输入以及会话 stop/restart。

Demo 默认只依赖 pub.dev 上的 `autoark_eva_client_sdk 0.0.1`，不依赖 SDK 源码仓库。SDK 创建主路径集中在 [`lib/sdk_usage.dart`](lib/sdk_usage.dart)；[`lib/demo_controller.dart`](lib/demo_controller.dart) 只管理会话与 UI 状态，[`lib/demo_app.dart`](lib/demo_app.dart) 只负责页面展示。接入方可以先阅读 `sdk_usage.dart`，再按自己的产品替换 UI。

当前公开 SDK `0.0.1` 只支持 Android。目录中保留同一个 iOS host，未来 SDK 提供 iOS native implementation 后继续复用同一份 `lib/`，不另建一套 UI Demo。

## 环境要求

- Flutter / Dart 版本满足 `pubspec.yaml`
- Android API 24+、arm64 设备或模拟器
- Java 17
- Android 麦克风与摄像头 runtime permission
- 开发者自行管理的 EVA Gateway AK

## 安装与运行

先按 committed lockfile 安装公开制品：

```bash
flutter pub get
```

### 不内置 AK：运行时输入

AK 是可选的构建输入。没有本地 AK 时直接构建或运行：

```bash
node scripts/build-android-demo.mjs
# 或直接开发运行
flutter run -d <device-id>
```

生成的 APK 不包含 Gateway AK。app 启动后会显示遮罩输入框；输入 AK 并点击“使用 AK 并开始”后才创建 Agent 和启动语音会话。运行时输入的 AK 只保存在当前 app 进程内，不写文件、不进入事件或诊断信息；stop/restart 会在本次进程中继续使用，彻底关闭 app 后需要重新输入。

release 构建同样可以不带 AK：

```bash
node scripts/build-android-demo.mjs --release
```

### 内置 AK：本地测试

key file 保存在仓库外，至少包含：

```dotenv
EVA_GATEWAY_API_KEY=<value>
```

开发运行时可从 demo 目录启动：

```bash
node scripts/run-flutter-demo-with-key-file.mjs /absolute/path/to/key-file -d <device-id>
```

launcher 只读取声明的变量，不执行 key file 内容，也不打印 AK。它把所需值写入权限为 `0600` 的临时 JSON，作为本次 `flutter run` 的 `--dart-define-from-file` 输入，并在进程退出后删除。

需要生成安装后无需输入 AK 的测试 APK：

```bash
node scripts/build-android-demo.mjs --key-file /absolute/path/to/key-file
# release 测试 APK
node scripts/build-android-demo.mjs --release --key-file /absolute/path/to/key-file
```

build launcher 使用同样的安全解析与临时 define 文件；AK 会作为 Dart compile-time define 进入 APK。即使是 release APK，内置 AK 也可能被逆向提取，因此这种模式只适合受控的本地/内部测试，不能作为凭证保密或公开分发方案。

Android app 启动时申请 `RECORD_AUDIO` 和 `CAMERA`。麦克风、TTS 默认开启，camera 默认关闭，可在页面中切换。可以说“现在几点”触发 `get_current_time`，或要求按指定称呼和语气问候以触发 `format_greeting`；Command 和 Emotion 结果会出现在 event timeline。

验证结束后应卸载带 AK 的测试 app 并清理本地 build 输出。无论使用哪种模式，都不要把 AK 写进源码、manifest、lockfile 或 Git。

## SDK 接入主路径

[`lib/sdk_usage.dart`](lib/sdk_usage.dart) 连续展示了消费者通常最关心的部分：

1. 从应用配置接收 Gateway AK 与 ASR/LLM/TTS model；
2. 通过 `EvaAgentConfig` 组合 ASR、LLM、TTS；
3. 配置 system prompt、static greeting 和业务 metadata；
4. opt-in 开启 Emotion，并注册两个无外部副作用的 Command；
5. 省略 `transports`，使用 SDK 自带的 Android microphone、speaker、system AEC 与 CameraX helper；
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

脚本只生成被 Git 忽略的 `pubspec_overrides.yaml`，不会改动 `pubspec.yaml`。该 override 位于 Dart package resolution 层，不绑定 Android；未来 iOS 仍使用同一条命令和同一份 UI。恢复公开制品：

```bash
node scripts/use-local-sdk.mjs --registry
flutter pub get
```

提交前应恢复 registry mode，并运行根目录 catalog checker。它会拒绝本地 override、源码路径 lock、被误迁入的 `integration_test/` 和非 pub.dev SDK 来源。

## 自动检查与人工边界

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

自动检查证明公开 package 可解析、Dart UI/controller 行为、Android 编译和依赖泄漏边界。真实 Gateway、麦克风、扬声器听感、OEM audio route/AEC、camera 画面与 stop 后设备资源释放仍需目标 Android 真机人工验收。

## SDK 兼容性

精确版本由 `pubspec.yaml` 和 `pubspec.lock` 共同锁定。升级时修改 exact version、重新运行 `flutter pub get`，并完成上述自动检查和目标设备回归。iOS host 当前只是未来兼容结构；`autoark_eva_client_sdk 0.0.1` 没有 iOS native implementation，因此当前不把 iOS build 或运行声明为支持。

## License

Demo 源码适用仓库根目录 [MIT License](../../../LICENSE)。`autoark_eva_client_sdk` 仍适用其随 pub package 分发的许可协议。
