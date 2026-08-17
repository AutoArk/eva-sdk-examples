import 'dart:async';

import 'package:autoark_eva_client_sdk/autoark_eva_client_sdk.dart';

const String demoSystemPrompt = '''
你是 EVA，一个正在通过实时语音与用户交流的智能助手。
用户消息可能由语音识别转写而来，可能包含口语、省略、同音字或少量识别错误。请结合上下文理解用户意图，优先用自然、简洁、适合直接朗读的口语回答；不要把交互描述成打字、文本聊天或“阅读消息”，除非用户明确谈论文字。
当本轮消息附带图片时，该图片来自用户当前设备的摄像头，代表用户此刻让你看到的画面。用户问“你看到了什么”“这是什么”等问题时，应直接根据图片内容回答，就像你正通过摄像头观察现场；不要要求用户再次上传图片，也不要声称无法访问已经附带的摄像头画面。
如果语音转写或画面信息不足以可靠判断，请自然地向用户追问，不要编造。
''';

final class DemoConfiguration {
  const DemoConfiguration({
    required this.apiKey,
    this.asrModel = 'ark-asr-plus',
    this.llmModel = 'volcengine-doubao-seed-2.0-mini',
    this.ttsModel = 'ark-tts-flash',
  });

  factory DemoConfiguration.fromEnvironment() => const DemoConfiguration(
    apiKey: String.fromEnvironment('EVA_GATEWAY_API_KEY'),
    llmModel: String.fromEnvironment(
      'EVA_GATEWAY_LLM_MODEL',
      defaultValue: 'volcengine-doubao-seed-2.0-mini',
    ),
    ttsModel: String.fromEnvironment(
      'EVA_GATEWAY_TTS_MODEL',
      defaultValue: 'ark-tts-flash',
    ),
  );

  final String apiKey;
  final String asrModel;
  final String llmModel;
  final String ttsModel;

  DemoConfiguration withApiKey(String value) => DemoConfiguration(
    apiKey: value,
    asrModel: asrModel,
    llmModel: llmModel,
    ttsModel: ttsModel,
  );

  bool get isReady =>
      apiKey.trim().isNotEmpty &&
      asrModel.trim().isNotEmpty &&
      llmModel.trim().isNotEmpty &&
      ttsModel.trim().isNotEmpty;
}

/// SDK 接入主路径：把应用配置转换为一个使用 Android 默认媒体 helper 的 EVA Agent。
DemoAgentPort createEvaDemoAgent(DemoConfiguration config) {
  final EvaAgent agent = EvaAgent.create(buildEvaAgentConfig(config));
  return EvaDemoAgentPort._(agent);
}

/// Demo 选择的完整 public SDK 配置；UI 不参与配置拼装。
EvaAgentConfig buildEvaAgentConfig(DemoConfiguration config) => EvaAgentConfig(
  // 必填：Gateway AK 与 ASR、LLM、TTS model 由接入应用提供。
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

  // 省略 transports，Android 会使用 SDK 自带的麦克风、扬声器、AEC 与 CameraX helper。
  vad: const EvaVadConfig(sensitivity: 0.7, silenceThresholdMs: 400),
  history: const EvaHistoryConfig(maxTurns: 10),
  camera: const EvaCameraConfig(
    captureTimeoutMs: 1500,
    maxLongEdge: 640,
    jpegQuality: 70,
  ),
  bargeIn: const EvaBargeInConfig(initialPlaybackGuardMs: 3000),
  systemPrompt: demoSystemPrompt,
  greeting: const EvaStaticGreeting('你好，我是 EVA，很高兴认识你。'),
  metadata: const <String, Object?>{'surface': 'flutter-demo'},

  // 可选：省略 emotion 时不会运行旁路分类，也不会产生 emotion.detected。
  emotion: EvaEmotionConfig(enabled: true),

  // 可选：省略 commands 时不会向 LLM 暴露 command definitions 或执行 handler。
  commands: EvaCommandsConfig(
    maxCallsPerTurn: 3,
    registrations: _buildDemoCommands(),
  ),
);

List<EvaCommandRegistration> _buildDemoCommands() => <EvaCommandRegistration>[
  EvaCommandRegistration(
    definition: EvaCommandDefinition(
      name: 'get_current_time',
      description: '获取设备当前时间。用户询问当前时间时调用。',
    ),
    handler: (_, _) {
      final DateTime now = DateTime.now();
      return EvaCommandSuccess(
        message: '设备当前时间为 ${now.toIso8601String()}。',
        data: <String, Object?>{'iso': now.toIso8601String()},
      );
    },
  ),
  EvaCommandRegistration(
    definition: EvaCommandDefinition(
      name: 'format_greeting',
      description: '根据称呼与语气生成一条问候语，不执行外部业务副作用。',
      parameters: <EvaCommandParameter>[
        EvaStringCommandParameter(
          name: 'tone',
          description: '问候语气。',
          required: true,
          enumValues: const <String>['formal', 'casual'],
        ),
        EvaStringCommandParameter(
          name: 'name',
          description: '问候对象。',
          required: true,
        ),
      ],
    ),
    handler: (EvaCommandCall call, _) {
      final String name = call.arguments['name'] as String;
      final String tone = call.arguments['tone'] as String;
      return EvaCommandSuccess(
        message: tone == 'formal' ? '尊敬的 $name，您好。' : '$name，你好！',
      );
    },
  ),
];

abstract interface class DemoAgentPort {
  Stream<EvaAgentEvent> get events;

  Future<void> start();
  Future<void> stop();
  Future<void> submitText(String text);
  Future<void> setAudioInputEnabled(bool enabled);
  Future<void> setCameraEnabled(bool enabled);
  Future<void> setTtsEnabled(bool enabled);
  Future<List<EvaConversationMessage>> getMessages();
}

typedef DemoAgentFactory = DemoAgentPort Function(DemoConfiguration config);

final class EvaDemoAgentPort implements DemoAgentPort {
  EvaDemoAgentPort._(this._agent);

  final EvaAgent _agent;

  @override
  Stream<EvaAgentEvent> get events => _agent.events;

  @override
  Future<List<EvaConversationMessage>> getMessages() => _agent.getMessages();

  @override
  Future<void> setAudioInputEnabled(bool enabled) =>
      _agent.setAudioInputEnabled(enabled);

  @override
  Future<void> setCameraEnabled(bool enabled) =>
      _agent.setCameraEnabled(enabled);

  @override
  Future<void> setTtsEnabled(bool enabled) => _agent.setTtsEnabled(enabled);

  @override
  Future<void> start() => _agent.start();

  @override
  Future<void> stop() => _agent.stop();

  @override
  Future<void> submitText(String text) => _agent.submitText(text);
}
