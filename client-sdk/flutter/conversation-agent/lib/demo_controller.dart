import 'dart:async';

import 'package:autoark_eva_client_sdk/autoark_eva_client_sdk.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'sdk_usage.dart';

const int demoEventLimit = 200;
const MethodChannel _iosDemoPermissions = MethodChannel(
  'ai.autoark.eva.demo/permissions',
);

String formatDemoDuration(Duration duration) {
  final int totalSeconds = duration.inSeconds;
  final int hours = totalSeconds ~/ Duration.secondsPerHour;
  final int minutes =
      (totalSeconds % Duration.secondsPerHour) ~/ Duration.secondsPerMinute;
  final int seconds = totalSeconds % Duration.secondsPerMinute;
  final String mm = minutes.toString().padLeft(2, '0');
  final String ss = seconds.toString().padLeft(2, '0');
  return hours == 0 ? '$mm:$ss' : '${hours.toString().padLeft(2, '0')}:$mm:$ss';
}

enum DemoRunState { idle, starting, running, stopping, stopped, faulted }

final class DemoEventEntry {
  const DemoEventEntry({
    required this.type,
    required this.summary,
    this.turnId,
  });

  factory DemoEventEntry.fromEvent(EvaAgentEvent event) {
    final EvaCommandCall? call = event.commandCall;
    final EvaCommandResult? result = event.commandResult;
    final EvaEmotionDetectedPayload? emotion = event.emotion;
    final EvaStructuredError? error = event.error;
    String summary = '';
    if (call != null) {
      summary = result == null
          ? call.name
          : '${call.name} · ${result.ok ? 'completed' : 'failed'}';
    } else if (emotion != null) {
      summary = '${emotion.emotionCode} · ${emotion.source.name}';
    } else if (error != null) {
      summary = _errorSummary(error);
    } else if (event.type == EvaAgentEventType.turnLatency) {
      summary = _latencySummary(event.payload);
    } else if (event.type == EvaAgentEventType.imageCaptured) {
      summary = _imageSummary(event.payload);
    } else {
      final Object? text = event.payload['text'];
      if (text is String) summary = _singleLine(text);
    }
    return DemoEventEntry(
      type: event.type.wireName,
      turnId: event.turnId,
      summary: summary,
    );
  }

  final String type;
  final String? turnId;
  final String summary;
}

String _errorSummary(EvaStructuredError error) => <String>[
  'source: ${error.source.name}',
  if (error.provider != null) 'provider: ${error.provider}',
  if (error.statusCode != null) 'statusCode: ${error.statusCode}',
  'message: ${_compactSingleLine(error.message)}',
  'fatal: ${error.fatal}',
  if (error.traceId != null) 'traceId: ${error.traceId}',
  if (error.role != null) 'role: ${error.role}',
  if (error.operation != null) 'operation: ${error.operation}',
  if (error.reason != null) 'reason: ${error.reason}',
].join('\n');

String _latencySummary(Map<String, Object?> payload) {
  final Map<String, Object?> latency = _stringMap(payload['latency']);
  final Map<String, Object?> stages = _stringMap(latency['stages']);
  final List<String> fields = <String>[
    if (_number(stages['vadMs']) case final int value) 'vad ${value}ms',
    if (_number(stages['asrMs']) case final int value) 'asr ${value}ms',
    if (_number(stages['llmFirstTokenMs']) case final int value)
      'llm-first ${value}ms',
    if (_number(stages['ttsFirstAudioMs']) case final int value)
      'tts-first ${value}ms',
    if (_number(stages['playbackMs']) case final int value) 'play ${value}ms',
    if (_number(latency['totalMs']) case final int value) 'total ${value}ms',
  ];
  return fields.join(' · ');
}

String _imageSummary(Map<String, Object?> payload) {
  final Map<String, Object?> image = _stringMap(payload['image']);
  final int? width = _number(image['width']);
  final int? height = _number(image['height']);
  final int? sizeBytes = _number(image['sizeBytes']);
  final int? captureMs = _number(image['captureMs']);
  final List<String> fields = <String>[
    if (width != null && height != null) '${width}x$height',
    if (sizeBytes != null)
      '$sizeBytes B (${(sizeBytes / 1024).toStringAsFixed(0)}KiB)',
    if (captureMs != null) 'capture ${captureMs}ms',
  ];
  return fields.join(' · ');
}

Map<String, Object?> _stringMap(Object? value) {
  if (value is! Map<Object?, Object?>) return const <String, Object?>{};
  return value.map(
    (Object? key, Object? item) =>
        MapEntry<String, Object?>(key as String, item),
  );
}

int? _number(Object? value) => value is num ? value.toInt() : null;

String _singleLine(String value) {
  final String compact = _compactSingleLine(value);
  return compact.length <= 120 ? compact : '${compact.substring(0, 120)}...';
}

String _compactSingleLine(String value) =>
    value.replaceAll(RegExp(r'\s+'), ' ').trim();

final class DemoController extends ChangeNotifier {
  factory DemoController({
    required DemoConfiguration configuration,
    DemoAgentFactory? agentFactory,
  }) => DemoController._(configuration, agentFactory ?? createEvaDemoAgent);

  DemoController._(this._configuration, this._agentFactory);

  DemoConfiguration _configuration;
  final DemoAgentFactory _agentFactory;
  final List<DemoEventEntry> _events = <DemoEventEntry>[];
  final List<EvaConversationMessage> _messages = <EvaConversationMessage>[];

  DemoAgentPort? _agent;
  StreamSubscription<EvaAgentEvent>? _subscription;
  DemoRunState _state = DemoRunState.idle;
  String? _statusDetail;
  int _generation = 0;
  bool _audioEnabled = true;
  bool _cameraEnabled = false;
  bool _ttsEnabled = true;
  Timer? _sessionTimer;
  DateTime? _sessionStartedAt;
  Duration _sessionElapsed = Duration.zero;
  bool _disposed = false;
  bool _usesRuntimeApiKey = false;

  DemoConfiguration get configuration => _configuration;
  DemoRunState get state => _state;
  String? get statusDetail => _statusDetail;
  bool get audioEnabled => _audioEnabled;
  bool get cameraEnabled => _cameraEnabled;
  bool get ttsEnabled => _ttsEnabled;
  Duration get sessionElapsed => _sessionElapsed;
  List<DemoEventEntry> get events => List<DemoEventEntry>.unmodifiable(_events);
  List<EvaConversationMessage> get messages =>
      List<EvaConversationMessage>.unmodifiable(_messages);
  bool get isConfigured => _configuration.isReady;
  bool get canStart =>
      isConfigured &&
      _state != DemoRunState.starting &&
      _state != DemoRunState.running &&
      _state != DemoRunState.stopping;
  bool get canStop => _state == DemoRunState.running;
  bool get canInteract => _state == DemoRunState.running;
  bool get canConfigureMedia =>
      _state != DemoRunState.starting && _state != DemoRunState.stopping;

  Future<void> start() async {
    if (!canStart) return;
    await _activateFreshAgent();
  }

  Future<void> startWithApiKey(String apiKey) async {
    final String normalized = apiKey.trim();
    if (normalized.isEmpty ||
        _state == DemoRunState.starting ||
        _state == DemoRunState.running ||
        _state == DemoRunState.stopping) {
      return;
    }
    _configuration = _configuration.withApiKey(normalized);
    _usesRuntimeApiKey = true;
    _notify();
    await _activateFreshAgent();
  }

  Future<void> restart() async {
    if (!isConfigured ||
        _state == DemoRunState.starting ||
        _state == DemoRunState.stopping) {
      return;
    }
    if (_agent != null) await stop();
    if (!_disposed) await _activateFreshAgent();
  }

  Future<void> _activateFreshAgent() async {
    final int generation = ++_generation;
    _resetSessionClock();
    _events.clear();
    _messages.clear();
    _state = DemoRunState.starting;
    _statusDetail = null;
    _notify();
    final DemoAgentPort agent = _agentFactory(_configuration);
    _agent = agent;
    _subscription = agent.events.listen(
      (EvaAgentEvent event) => _onEvent(generation, event),
      onError: (Object error) => _onStreamError(generation),
    );
    try {
      if (_audioEnabled) await _requestMicrophonePermission();
      await agent.setAudioInputEnabled(_audioEnabled);
      if (_cameraEnabled) await _requestCameraPermission();
      await agent.setCameraEnabled(_cameraEnabled);
      await agent.setTtsEnabled(_ttsEnabled);
      await agent.start();
      if (!_isCurrent(generation)) return;
      _state = DemoRunState.running;
      _startSessionClock(generation);
      _notify();
    } on EvaException catch (error) {
      if (!_isCurrent(generation)) return;
      _state = DemoRunState.faulted;
      _statusDetail = _startFailureSummary(error.error);
      if (_usesRuntimeApiKey) {
        _configuration = _configuration.withApiKey('');
        _usesRuntimeApiKey = false;
      }
      _resetSessionClock();
      _notify();
      await _releaseAgent(agent, generation, stop: true);
    } on Object catch (error) {
      if (!_isCurrent(generation)) return;
      _state = DemoRunState.faulted;
      _statusDetail = 'start failed: ${error.runtimeType}';
      if (_usesRuntimeApiKey) {
        _configuration = _configuration.withApiKey('');
        _usesRuntimeApiKey = false;
      }
      _resetSessionClock();
      _notify();
      await _releaseAgent(agent, generation, stop: true);
    }
  }

  String _startFailureSummary(EvaStructuredError error) => <String>[
    'start failed',
    'source: ${error.source.name}',
    if (error.provider != null) 'provider: ${error.provider}',
    if (error.statusCode != null) 'statusCode: ${error.statusCode}',
    'message: ${_compactSingleLine(error.message)}',
    'fatal: ${error.fatal}',
    if (error.traceId != null) 'traceId: ${error.traceId}',
    if (error.role != null) 'role: ${error.role}',
    if (error.operation != null) 'operation: ${error.operation}',
    if (error.reason != null) 'reason: ${error.reason}',
  ].join('\n');

  Future<void> stop() async {
    final DemoAgentPort? agent = _agent;
    if (agent == null || _state == DemoRunState.stopping) return;
    final int generation = _generation;
    _freezeSessionClock();
    _state = DemoRunState.stopping;
    _notify();
    try {
      await agent.stop();
      final List<EvaConversationMessage> snapshot = await agent.getMessages();
      if (!_isCurrent(generation)) return;
      _messages
        ..clear()
        ..addAll(snapshot);
      _state = DemoRunState.stopped;
      _statusDetail = null;
    } on Object {
      if (!_isCurrent(generation)) return;
      _state = DemoRunState.faulted;
      _statusDetail = 'Agent stop failed';
    } finally {
      await _releaseAgent(agent, generation, stop: false);
      _notify();
    }
  }

  Future<void> submitText(String text) async {
    final DemoAgentPort? agent = _agent;
    final String normalized = text.trim();
    if (agent == null || !canInteract || normalized.isEmpty) return;
    final int generation = _generation;
    final bool succeeded = await _runControl(
      () => agent.submitText(normalized),
      'Text send failed',
    );
    if (succeeded && _isCurrent(generation)) {
      unawaited(_refreshMessagesForGeneration(generation));
    }
  }

  Future<void> setAudioEnabled(bool enabled) async {
    final DemoAgentPort? agent = _agent;
    if (!canConfigureMedia || enabled == _audioEnabled) return;
    if (agent == null || _state != DemoRunState.running) {
      _audioEnabled = enabled;
      _notify();
      return;
    }
    if (enabled) await _requestMicrophonePermission();
    final bool succeeded = await _runControl(
      () => agent.setAudioInputEnabled(enabled),
      'Audio control failed',
    );
    if (succeeded) _audioEnabled = enabled;
    _notify();
  }

  Future<void> resumeMediaAfterForeground() async {
    final DemoAgentPort? agent = _agent;
    if (agent == null || _state != DemoRunState.running) return;
    if (_audioEnabled) {
      await _runControl(
        () => agent.setAudioInputEnabled(true),
        'Audio resume failed',
      );
    }
    if (_cameraEnabled && _isCurrent(_generation)) {
      await _runControl(
        () => agent.setCameraEnabled(true),
        'Camera resume failed',
      );
    }
  }

  Future<bool> _requestMicrophonePermission() async {
    try {
      return await _iosDemoPermissions.invokeMethod<bool>(
            'requestMicrophone',
          ) ??
          true;
    } on MissingPluginException {
      // Android and injected media implementations own their own permission flow.
      return true;
    } on PlatformException catch (error) {
      if (error.code == 'channel-error') return true;
      rethrow;
    }
  }

  Future<bool> _requestCameraPermission() async {
    try {
      return await _iosDemoPermissions.invokeMethod<bool>('requestCamera') ??
          true;
    } on MissingPluginException {
      // Android and injected media implementations own their own permission flow.
      return true;
    } on PlatformException catch (error) {
      if (error.code == 'channel-error') return true;
      rethrow;
    }
  }

  Future<void> setCameraEnabled(bool enabled) async {
    final DemoAgentPort? agent = _agent;
    if (!canConfigureMedia || enabled == _cameraEnabled) return;
    if (agent == null || _state != DemoRunState.running) {
      if (enabled && !await _requestCameraPermission()) {
        _statusDetail = _cameraPermissionFailureSummary();
        _notify();
        return;
      }
      _cameraEnabled = enabled;
      _notify();
      return;
    }
    if (enabled) await _requestCameraPermission();
    final bool succeeded = await _runControl(
      () => agent.setCameraEnabled(enabled),
      'Camera control failed',
    );
    if (succeeded) _cameraEnabled = enabled;
    _notify();
  }

  String _cameraPermissionFailureSummary() => const <String>[
    'camera failed',
    'source: media',
    'message: Camera permission was denied',
    'fatal: false',
    'role: camera',
    'operation: start',
    'reason: permission_denied',
  ].join('\n');

  Future<void> setTtsEnabled(bool enabled) async {
    final DemoAgentPort? agent = _agent;
    if (!canConfigureMedia || enabled == _ttsEnabled) return;
    if (agent == null || _state != DemoRunState.running) {
      _ttsEnabled = enabled;
      _notify();
      return;
    }
    final bool succeeded = await _runControl(
      () => agent.setTtsEnabled(enabled),
      'TTS control failed',
    );
    if (succeeded) _ttsEnabled = enabled;
    _notify();
  }

  Future<void> refreshMessages() async {
    final DemoAgentPort? agent = _agent;
    if (agent == null) return;
    final int generation = _generation;
    try {
      final List<EvaConversationMessage> snapshot = await agent.getMessages();
      if (!_isCurrent(generation)) return;
      _messages
        ..clear()
        ..addAll(snapshot);
      _notify();
    } on Object {
      if (!_isCurrent(generation)) return;
      _statusDetail = 'Message refresh failed';
      _notify();
    }
  }

  void clearEvents() {
    _events.clear();
    _notify();
  }

  Future<bool> _runControl(
    Future<void> Function() operation,
    String failure,
  ) async {
    try {
      await operation();
      return true;
    } on EvaException catch (error) {
      _statusDetail = _startFailureSummary(error.error);
      _notify();
      return false;
    } on Object {
      _statusDetail = failure;
      _notify();
      return false;
    }
  }

  void _onEvent(int generation, EvaAgentEvent event) {
    if (!_isCurrent(generation)) return;
    _events.add(DemoEventEntry.fromEvent(event));
    if (_events.length > demoEventLimit) {
      _events.removeRange(0, _events.length - demoEventLimit);
    }
    _notify();
    if (event.type == EvaAgentEventType.transcriptFinal ||
        event.type == EvaAgentEventType.replyFinal) {
      unawaited(_refreshMessagesForGeneration(generation));
    }
  }

  Future<void> _refreshMessagesForGeneration(int generation) async {
    final DemoAgentPort? agent = _agent;
    if (agent == null || !_isCurrent(generation)) return;
    try {
      final List<EvaConversationMessage> snapshot = await agent.getMessages();
      if (!_isCurrent(generation)) return;
      _messages
        ..clear()
        ..addAll(snapshot);
      _notify();
    } on Object {
      // The event stream remains authoritative; the refresh button can retry.
    }
  }

  void _onStreamError(int generation) {
    if (!_isCurrent(generation)) return;
    _statusDetail = 'Event stream error';
    _notify();
  }

  Future<void> _releaseAgent(
    DemoAgentPort agent,
    int generation, {
    required bool stop,
  }) async {
    if (stop) {
      try {
        await agent.stop();
      } on Object {
        // The visible failure was already normalized above.
      }
    }
    final StreamSubscription<EvaAgentEvent>? subscription = _subscription;
    if (_agent == agent && _generation == generation) {
      _agent = null;
      _subscription = null;
    }
    await subscription?.cancel();
  }

  void _startSessionClock(int generation) {
    _sessionTimer?.cancel();
    _sessionStartedAt = DateTime.now();
    _sessionElapsed = Duration.zero;
    _sessionTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_isCurrent(generation) || _state != DemoRunState.running) return;
      final DateTime startedAt = _sessionStartedAt ?? DateTime.now();
      _sessionElapsed = DateTime.now().difference(startedAt);
      _notify();
    });
  }

  void _freezeSessionClock() {
    final DateTime? startedAt = _sessionStartedAt;
    if (startedAt != null) {
      _sessionElapsed = DateTime.now().difference(startedAt);
    }
    _sessionTimer?.cancel();
    _sessionTimer = null;
    _sessionStartedAt = null;
  }

  void _resetSessionClock() {
    _sessionTimer?.cancel();
    _sessionTimer = null;
    _sessionStartedAt = null;
    _sessionElapsed = Duration.zero;
  }

  bool _isCurrent(int generation) => !_disposed && generation == _generation;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> close() async {
    if (_disposed) return;
    _disposed = true;
    _sessionTimer?.cancel();
    _sessionTimer = null;
    _generation += 1;
    final DemoAgentPort? agent = _agent;
    _agent = null;
    final StreamSubscription<EvaAgentEvent>? subscription = _subscription;
    _subscription = null;
    try {
      await agent?.stop();
    } on Object {
      // App teardown cannot surface a new interaction.
    }
    await subscription?.cancel();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
