import 'dart:async';

import 'package:autoark_eva_client_sdk/autoark_eva_client_sdk.dart';
import 'package:eva_flutter_conversation_agent/demo_app.dart';
import 'package:eva_flutter_conversation_agent/demo_controller.dart';
import 'package:eva_flutter_conversation_agent/sdk_usage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const DemoConfiguration readyConfiguration = DemoConfiguration(
    apiKey: 'test-only-credential',
  );

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('ai.autoark.eva.demo/permissions'),
          (MethodCall call) async => true,
        );
  });

  test('demo system prompt establishes voice and camera context', () {
    expect(demoSystemPrompt, contains('语音识别转写'));
    expect(demoSystemPrompt, contains('自然、简洁、适合直接朗读'));
    expect(demoSystemPrompt, contains('图片来自用户当前设备的摄像头'));
    expect(demoSystemPrompt, contains('当本轮消息附带图片时'));
    expect(demoSystemPrompt, contains('不要编造'));
  });

  testWidgets('missing build credential accepts a process-only runtime value', (
    WidgetTester tester,
  ) async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: const DemoConfiguration(apiKey: ''),
      agentFactory: factory.create,
    );
    await tester.pumpWidget(
      EvaDemoApp(
        configuration: controller.configuration,
        controller: controller,
      ),
    );

    expect(find.text('输入 Gateway AK 以开始会话'), findsOneWidget);
    final TextField apiKeyField = tester.widget<TextField>(
      find.byKey(const Key('api-key-field')),
    );
    expect(apiKeyField.obscureText, isTrue);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('start-button')))
          .onPressed,
      isNull,
    );
    expect(find.textContaining('test-only-credential'), findsNothing);
    await controller.start();
    expect(factory.agents, isEmpty);

    await tester.enterText(
      find.byKey(const Key('api-key-field')),
      '  runtime-test-credential  ',
    );
    await tester.pump();
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const Key('start-with-api-key-button')),
          )
          .onPressed,
      isNotNull,
    );
    await tester.tap(find.byKey(const Key('start-with-api-key-button')));
    await tester.pumpAndSettle();

    expect(factory.agents, hasLength(1));
    expect(factory.configurations.single.apiKey, 'runtime-test-credential');
    expect(find.textContaining('runtime-test-credential'), findsNothing);
    expect(find.byKey(const Key('api-key-field')), findsNothing);
  });

  test('start, text and media controls use the current public agent', () async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );
    addTearDown(controller.dispose);

    await controller.start();
    final _FakeAgent agent = factory.agents.single;
    expect(factory.configurations.single.apiKey, 'test-only-credential');
    expect(controller.state, DemoRunState.running);
    expect(agent.started, 1);
    expect(agent.audioValues, <bool>[true]);
    expect(agent.cameraValues, <bool>[false]);
    expect(agent.ttsValues, <bool>[true]);

    await controller.submitText('  hello EVA  ');
    await controller.setAudioEnabled(false);
    await controller.setCameraEnabled(true);
    await controller.setTtsEnabled(false);

    expect(agent.texts, <String>['hello EVA']);
    expect(agent.audioValues, <bool>[true, false]);
    expect(agent.cameraValues, <bool>[false, true]);
    expect(agent.ttsValues, <bool>[true, false]);
  });

  testWidgets(
    'foreground resume explicitly reacquires only user-enabled media',
    (WidgetTester tester) async {
      final _FakeAgentFactory factory = _FakeAgentFactory();
      final DemoController controller = DemoController(
        configuration: readyConfiguration,
        agentFactory: factory.create,
      );
      await controller.setCameraEnabled(true);
      await tester.pumpWidget(
        EvaDemoApp(
          configuration: controller.configuration,
          controller: controller,
        ),
      );
      await controller.start();
      final _FakeAgent agent = factory.agents.single;
      expect(agent.audioValues, <bool>[true]);
      expect(agent.cameraValues, <bool>[true]);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(agent.audioValues, <bool>[true, true]);
      expect(agent.cameraValues, <bool>[true, true]);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(
        agent.audioValues,
        <bool>[true, true],
        reason: 'plain resumed must not duplicate reacquisition',
      );
      expect(agent.cameraValues, <bool>[true, true]);
    },
  );

  test('start failure keeps structured error details visible', () async {
    final _FakeAgentFactory factory = _FakeAgentFactory(
      startError: const EvaException(
        EvaStructuredError(
          source: EvaErrorSource.gateway,
          provider: 'auth',
          statusCode: 401,
          message: 'invalid_api_key',
          fatal: true,
          traceId: 'trace-start-401',
        ),
      ),
    );
    final DemoController controller = DemoController(
      configuration: const DemoConfiguration(apiKey: ''),
      agentFactory: factory.create,
    );
    addTearDown(controller.dispose);

    await controller.startWithApiKey('runtime-test-key');

    expect(controller.state, DemoRunState.faulted);
    expect(controller.statusDetail, contains('source: gateway'));
    expect(controller.statusDetail, contains('provider: auth'));
    expect(controller.statusDetail, contains('statusCode: 401'));
    expect(controller.statusDetail, contains('traceId: trace-start-401'));
    expect(controller.statusDetail, isNot(contains('Agent start failed')));
  });

  test('media controls can be configured before start', () async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );
    addTearDown(controller.dispose);

    await controller.setAudioEnabled(false);
    await controller.setCameraEnabled(true);
    await controller.setTtsEnabled(false);

    expect(controller.audioEnabled, isFalse);
    expect(controller.cameraEnabled, isTrue);
    expect(controller.ttsEnabled, isFalse);
    expect(factory.agents, isEmpty);

    await controller.start();
    final _FakeAgent agent = factory.agents.single;
    expect(agent.audioValues, <bool>[false]);
    expect(agent.cameraValues, <bool>[true]);
    expect(agent.ttsValues, <bool>[false]);
  });

  test('camera permission denial keeps the switch disabled', () async {
    const MethodChannel permissions = MethodChannel(
      'ai.autoark.eva.demo/permissions',
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissions, (MethodCall call) async {
          if (call.method == 'requestCamera') return false;
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(permissions, null),
    );

    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: _FakeAgentFactory().create,
    );
    addTearDown(controller.dispose);

    await controller.setCameraEnabled(true);

    expect(controller.cameraEnabled, isFalse);
    expect(controller.statusDetail, contains('reason: permission_denied'));
    expect(controller.statusDetail, contains('role: camera'));
  });

  test('microphone permission is requested before starting audio', () async {
    const MethodChannel permissions = MethodChannel(
      'ai.autoark.eva.demo/permissions',
    );
    final List<String> calls = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissions, (MethodCall call) async {
          calls.add(call.method);
          return true;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(permissions, null),
    );

    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );
    addTearDown(controller.dispose);

    await controller.start();

    expect(calls, contains('requestMicrophone'));
    expect(factory.agents.single.started, 1);
  });

  test(
    'restart creates a fresh generation and suppresses old events',
    () async {
      final _FakeAgentFactory factory = _FakeAgentFactory();
      final DemoController controller = DemoController(
        configuration: readyConfiguration,
        agentFactory: factory.create,
      );
      addTearDown(controller.dispose);

      await controller.start();
      final _FakeAgent oldAgent = factory.agents.single;
      oldAgent.messages = <EvaConversationMessage>[
        _message(role: 'assistant', content: 'old run message'),
      ];
      oldAgent.emit(_event(text: 'before restart'));

      await controller.restart();
      final _FakeAgent newAgent = factory.agents.last;
      expect(factory.agents, hasLength(2));
      expect(oldAgent.stopped, 1);
      expect(oldAgent.hasEventListener, isFalse);
      expect(newAgent.started, 1);
      expect(controller.events, isEmpty);
      expect(controller.messages, isEmpty);

      oldAgent.emit(_event(text: 'stale credential-like callback'));
      newAgent.emit(_event(text: 'new generation'));

      expect(
        controller.events.map((DemoEventEntry entry) => entry.summary),
        <String>['new generation'],
      );
    },
  );

  test('timeline remains bounded to the newest 200 events', () async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );
    addTearDown(controller.dispose);
    await controller.start();

    for (var index = 0; index < 205; index += 1) {
      factory.agents.single.emit(_event(text: 'event-$index'));
    }

    expect(controller.events, hasLength(demoEventLimit));
    expect(controller.events.first.summary, 'event-5');
    expect(controller.events.last.summary, 'event-204');
  });

  test(
    'typed command, emotion, errors and messages use public projections',
    () async {
      final _FakeAgentFactory factory = _FakeAgentFactory();
      final DemoController controller = DemoController(
        configuration: readyConfiguration,
        agentFactory: factory.create,
      );
      addTearDown(controller.dispose);
      await controller.start();
      final _FakeAgent agent = factory.agents.single;
      agent.messages = <EvaConversationMessage>[
        _message(role: 'user', content: 'hello'),
        _message(role: 'assistant', content: 'hi'),
      ];

      agent.emit(_commandCompletedEvent());
      agent.emit(_emotionEvent());
      agent.emit(
        _event(
          type: EvaAgentEventType.error,
          error: const EvaStructuredError(
            source: EvaErrorSource.gateway,
            provider: 'tts',
            statusCode: 401,
            message:
                'Gateway request failed with status 401: invalid_api_key '
                'and this complete safe diagnostic message remains visible '
                'even when its length exceeds a normal event summary',
            fatal: true,
            traceId: 'trace-safe-401',
          ),
        ),
      );
      await controller.refreshMessages();

      expect(controller.events[0].summary, 'get_current_time · completed');
      expect(controller.events[1].summary, 'happy · text');
      expect(
        controller.events[2].summary,
        <String>[
          'source: gateway',
          'provider: tts',
          'statusCode: 401',
          'message: Gateway request failed with status 401: invalid_api_key '
              'and this complete safe diagnostic message remains visible '
              'even when its length exceeds a normal event summary',
          'fatal: true',
          'traceId: trace-safe-401',
        ].join('\n'),
      );
      expect(
        controller.messages.map(
          (EvaConversationMessage message) => message.content,
        ),
        <String>['hello', 'hi'],
      );
    },
  );

  testWidgets('event timeline shows complete structured gateway errors', (
    WidgetTester tester,
  ) async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );

    await tester.pumpWidget(
      EvaDemoApp(
        configuration: controller.configuration,
        controller: controller,
      ),
    );
    await tester.tap(find.byKey(const Key('start-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('events-button')));
    await tester.pumpAndSettle();

    factory.agents.single.emit(
      _event(
        type: EvaAgentEventType.error,
        error: const EvaStructuredError(
          source: EvaErrorSource.gateway,
          provider: 'asr',
          statusCode: 401,
          message: 'Gateway request failed with status 401: unauthorized',
          fatal: true,
          traceId: 'trace-ui-401',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('source: gateway'), findsOneWidget);
    expect(find.textContaining('provider: asr'), findsOneWidget);
    expect(find.textContaining('statusCode: 401'), findsOneWidget);
    expect(
      find.textContaining(
        'message: Gateway request failed with status 401: unauthorized',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('fatal: true'), findsOneWidget);
    expect(find.textContaining('traceId: trace-ui-401'), findsOneWidget);
  });

  test('latency and image events expose diagnostic measurements', () {
    final DemoEventEntry latency = DemoEventEntry.fromEvent(
      _event(
        type: EvaAgentEventType.turnLatency,
        payload: <String, Object?>{
          'latency': <String, Object?>{
            'stages': <String, Object?>{
              'vadMs': 4,
              'asrMs': 18,
              'llmFirstTokenMs': 230,
              'ttsFirstAudioMs': 96,
              'playbackMs': 8,
            },
            'totalMs': 348,
          },
        },
      ),
    );
    final DemoEventEntry image = DemoEventEntry.fromEvent(
      _event(
        type: EvaAgentEventType.imageCaptured,
        payload: <String, Object?>{
          'image': <String, Object?>{
            'width': 1280,
            'height': 960,
            'sizeBytes': 262144,
            'captureMs': 121,
          },
        },
      ),
    );

    expect(
      latency.summary,
      'vad 4ms · asr 18ms · llm-first 230ms · tts-first 96ms · play 8ms · total 348ms',
    );
    expect(image.summary, '1280x960 · 262144 B (256KiB) · capture 121ms');
  });

  testWidgets('workspace exposes lifecycle, media and conversation controls', (
    WidgetTester tester,
  ) async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );

    await tester.pumpWidget(
      EvaDemoApp(
        configuration: controller.configuration,
        controller: controller,
      ),
    );
    expect(find.text('今天天气怎么样？'), findsNothing);
    expect(find.text('我可以帮你查今天的天气。'), findsNothing);
    await tester.tap(find.byKey(const Key('start-button')));
    await tester.pumpAndSettle();

    expect(find.text('通话中'), findsOneWidget);
    await tester.tap(find.byKey(const Key('keyboard-input-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('microphone-switch')), findsOneWidget);
    expect(find.byKey(const Key('camera-switch')), findsOneWidget);
    expect(find.byKey(const Key('tts-switch')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('message-field')), 'hello');
    await tester.tap(find.byKey(const Key('send-button')));
    await tester.pump();
    expect(factory.agents.single.texts, <String>['hello']);

    expect(find.byKey(const Key('refresh-messages-button')), findsNothing);
  });

  testWidgets(
    'event timeline stays chronological and follows the newest event',
    (WidgetTester tester) async {
      final _FakeAgentFactory factory = _FakeAgentFactory();
      final DemoController controller = DemoController(
        configuration: readyConfiguration,
        agentFactory: factory.create,
      );

      await tester.pumpWidget(
        EvaDemoApp(
          configuration: controller.configuration,
          controller: controller,
        ),
      );
      await tester.tap(find.byKey(const Key('start-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('events-button')));
      await tester.pumpAndSettle();
      final _FakeAgent agent = factory.agents.single;
      agent.emit(_event(text: 'event-0'));
      agent.emit(_event(text: 'event-1'));
      await tester.pumpAndSettle();

      expect(
        controller.events.map((DemoEventEntry entry) => entry.summary),
        <String>['event-0', 'event-1'],
      );

      for (var index = 2; index < 80; index += 1) {
        agent.emit(_event(text: 'event-$index'));
      }
      await tester.pumpAndSettle();
      expect(find.textContaining('event-79'), findsOneWidget);
    },
  );

  testWidgets('messages render after final transcript and reply events', (
    WidgetTester tester,
  ) async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );

    await tester.pumpWidget(
      EvaDemoApp(
        configuration: controller.configuration,
        controller: controller,
      ),
    );
    await tester.tap(find.byKey(const Key('start-button')));
    await tester.pumpAndSettle();
    final _FakeAgent agent = factory.agents.single;
    agent.messages = <EvaConversationMessage>[
      _message(role: 'user', content: '你好 EVA'),
    ];
    agent.emit(_event(type: EvaAgentEventType.transcriptFinal));
    await tester.pumpAndSettle();

    expect(find.text('你好 EVA'), findsOneWidget);

    agent.messages = <EvaConversationMessage>[
      _message(role: 'user', content: '你好 EVA'),
      _message(role: 'assistant', content: '你好，我是 EVA。'),
    ];
    agent.emit(_event(type: EvaAgentEventType.replyFinal));
    await tester.pumpAndSettle();
    expect(find.text('你好，我是 EVA。'), findsOneWidget);
    expect(find.text('EVA'), findsNWidgets(2));
  });

  testWidgets('session timer starts, freezes on stop and resets on restart', (
    WidgetTester tester,
  ) async {
    final _FakeAgentFactory factory = _FakeAgentFactory();
    final DemoController controller = DemoController(
      configuration: readyConfiguration,
      agentFactory: factory.create,
    );
    addTearDown(controller.close);

    await tester.pumpWidget(
      EvaDemoApp(
        configuration: controller.configuration,
        controller: controller,
      ),
    );
    await tester.tap(find.byKey(const Key('start-button')));
    await tester.pumpAndSettle();

    expect(find.text('00:00'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(controller.sessionElapsed, greaterThan(Duration.zero));
    expect(
      find.text(formatDemoDuration(controller.sessionElapsed)),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('start-button')));
    await tester.pumpAndSettle();
    final Duration stoppedAt = controller.sessionElapsed;
    await tester.pump(const Duration(seconds: 2));
    expect(controller.sessionElapsed, stoppedAt);

    await controller.restart();
    await tester.pumpAndSettle();
    expect(controller.sessionElapsed, Duration.zero);
    expect(find.text('00:00'), findsOneWidget);
  });
}

final class _FakeAgentFactory {
  _FakeAgentFactory({this.startError});

  final EvaException? startError;
  final List<_FakeAgent> agents = <_FakeAgent>[];
  final List<DemoConfiguration> configurations = <DemoConfiguration>[];

  DemoAgentPort create(DemoConfiguration configuration) {
    configurations.add(configuration);
    final _FakeAgent agent = _FakeAgent(startError: startError);
    agents.add(agent);
    return agent;
  }
}

final class _FakeAgent implements DemoAgentPort {
  _FakeAgent({this.startError});

  final EvaException? startError;
  final StreamController<EvaAgentEvent> _events =
      StreamController<EvaAgentEvent>.broadcast(sync: true);
  final List<String> texts = <String>[];
  final List<bool> audioValues = <bool>[];
  final List<bool> cameraValues = <bool>[];
  final List<bool> ttsValues = <bool>[];
  List<EvaConversationMessage> messages = <EvaConversationMessage>[];
  int started = 0;
  int stopped = 0;

  @override
  Stream<EvaAgentEvent> get events => _events.stream;

  bool get hasEventListener => _events.hasListener;

  void emit(EvaAgentEvent event) => _events.add(event);

  @override
  Future<List<EvaConversationMessage>> getMessages() async => messages;

  @override
  Future<void> setAudioInputEnabled(bool enabled) async {
    audioValues.add(enabled);
  }

  @override
  Future<void> setCameraEnabled(bool enabled) async {
    cameraValues.add(enabled);
  }

  @override
  Future<void> setTtsEnabled(bool enabled) async {
    ttsValues.add(enabled);
  }

  @override
  Future<void> start() async {
    started += 1;
    if (startError != null) throw startError!;
  }

  @override
  Future<void> stop() async {
    stopped += 1;
  }

  @override
  Future<void> submitText(String text) async {
    texts.add(text);
  }
}

EvaAgentEvent _event({
  EvaAgentEventType type = EvaAgentEventType.replyFinal,
  String? text,
  EvaStructuredError? error,
  Map<String, Object?>? payload,
}) => EvaAgentEvent(
  type: type,
  streamId: 'demo-test',
  turnId: 'turn-1',
  sequence: 1,
  partial: false,
  finalEvent: true,
  timestamp: 1,
  metadata: const <String, Object?>{},
  frameId: 'frame-1',
  payload: payload ?? <String, Object?>{'text': ?text},
  error: error,
);

EvaAgentEvent _emotionEvent() => EvaAgentEvent(
  type: EvaAgentEventType.emotionDetected,
  streamId: 'demo-test',
  turnId: 'turn-1',
  sequence: 2,
  partial: false,
  finalEvent: true,
  timestamp: 2,
  metadata: const <String, Object?>{},
  frameId: 'frame-2',
  payload: const <String, Object?>{},
  error: null,
  emotion: const EvaEmotionDetectedPayload(
    source: EvaEmotionSource.text,
    textPreview: 'happy preview',
    emotionCode: 'happy',
    confidence: 0.8,
    latencyMs: 12,
  ),
);

EvaAgentEvent _commandCompletedEvent() {
  final EvaCommandDefinition definition = EvaCommandDefinition(
    name: 'get_current_time',
    description: 'Get the current time.',
  );
  return EvaAgentEvent.fromMap(
    <Object?, Object?>{
      'type': 'command.completed',
      'streamId': 'demo-test',
      'turnId': 'turn-1',
      'sequence': 1,
      'partial': false,
      'final': true,
      'timestamp': 1,
      'metadata': <String, Object?>{},
      'frameId': 'frame-command',
      'payload': <String, Object?>{
        'call': <String, Object?>{
          'id': 'call-1',
          'name': 'get_current_time',
          'argumentsJson': '{}',
          'arguments': <String, Object?>{},
        },
        'result': <String, Object?>{'ok': true, 'message': '12:00'},
      },
    },
    commandDefinitions: <String, EvaCommandDefinition>{
      definition.name: definition,
    },
  );
}

EvaConversationMessage _message({
  required String role,
  required String content,
}) => EvaConversationMessage.fromMap(<Object?, Object?>{
  'id': 'message-$role',
  'turnId': 'turn-1',
  'role': role,
  'content': content,
  'createdAt': 1,
  'metadata': <String, Object?>{},
});
