import 'package:eva_flutter_conversation_agent/sdk_usage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('concentrates the practical public SDK configuration', () {
    final config = buildEvaAgentConfig(
      const DemoConfiguration(
        apiKey: 'configuration-test-secret',
        asrModel: 'demo-asr',
        llmModel: 'demo-llm',
        ttsModel: 'demo-tts',
      ),
    );

    expect(config.asr.model, 'demo-asr');
    expect(config.asr.sampleRate, 16000);
    expect(config.llm.model, 'demo-llm');
    expect(config.tts.model, 'demo-tts');
    expect(config.tts.voice, 'zh_en_male_evan');
    expect(config.tts.sampleRate, 44100);
    expect(config.vad.sensitivity, 0.7);
    expect(config.vad.silenceThresholdMs, 400);
    expect(config.history?.maxTurns, 10);
    expect(config.camera?.captureTimeoutMs, 1500);
    expect(config.bargeIn?.initialPlaybackGuardMs, 3000);
    expect(config.transports, isNull);
    expect(config.emotion.enabled, isTrue);
    expect(config.commands?.registrations, hasLength(2));
    expect(config.commands?.maxCallsPerTurn, 3);
    expect(config.metadata, <String, Object?>{'surface': 'flutter-demo'});
  });
}
