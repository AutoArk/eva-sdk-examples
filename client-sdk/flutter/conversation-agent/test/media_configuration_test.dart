import 'package:autoark_eva_client_sdk/autoark_eva_client_sdk.dart';
import 'package:flutter_test/flutter_test.dart';

EvaAgentConfig _config({required int sampleRate}) => EvaAgentConfig(
  apiKey: 'configuration-test-secret',
  asr: EvaAsrConfig(model: 'mock-asr', sampleRate: sampleRate),
  tts: const EvaTtsConfig(model: 'mock-tts'),
  llm: EvaLlmConfig(model: 'mock-llm'),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('accepts supported input sample-rate candidates', () {
    expect(() => EvaAgent.create(_config(sampleRate: 16000)), returnsNormally);
    expect(() => EvaAgent.create(_config(sampleRate: 48000)), returnsNormally);
  });

  test('rejects a non-positive input sample rate before platform startup', () {
    expect(
      () => EvaAgent.create(_config(sampleRate: 0)),
      throwsA(
        isA<EvaException>().having(
          (EvaException error) => error.error.source,
          'source',
          EvaErrorSource.sdk,
        ),
      ),
    );
  });
}
