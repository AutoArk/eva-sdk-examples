#include "sdk_usage.hpp"
#include "commands.hpp"
#include <eva/helpers.hpp>

eva::Result<std::unique_ptr<eva::Agent>> create_agent(std::string key, const Options& options) {
  using namespace eva;
#if defined(__APPLE__)
  auto input = make_portaudio_audio_input({});
  auto output = make_portaudio_audio_output(PortAudioOutputOptions{std::nullopt, options.output_gain});
#else
  auto input = make_alsa_audio_input(AlsaInputOptions{options.input_device});
  auto output = make_alsa_audio_output(AlsaOutputOptions{options.output_device, options.output_gain});
#endif
  if (!input) return Result<std::unique_ptr<Agent>>::failure(input.error());
  if (!output) return Result<std::unique_ptr<Agent>>::failure(output.error());
  auto aec = make_native_aec(NativeAecOptions{options.aec_delay_ms});
  if (!aec) return Result<std::unique_ptr<Agent>>::failure(aec.error());
  std::unique_ptr<CameraSnapshotSource> camera;
  if (options.camera) {
#if defined(__APPLE__)
    auto made = make_avfoundation_camera(AvFoundationCameraOptions{options.camera_device, 640, 70});
#else
    auto made = make_v4l2_camera(V4l2CameraOptions{options.camera_device});
#endif
    if (!made) return Result<std::unique_ptr<Agent>>::failure(made.error());
    camera = std::move(made).value();
  }
  AgentConfig config;
  config.api_key = std::move(key);
  config.asr = {"ark-asr-plus", 16000};
  config.llm.model = "volcengine-doubao-seed-2.0-mini";
  config.llm.extra_parameters = {{"thinking", JsonValue::object({
      {"type", JsonValue::string("disabled").value()}}).value()}};
  config.tts.model = "ark-tts-flash";
  config.tts.voice = "zh_female_kido";
  config.tts.sample_rate = 44100;
  config.vad = VadConfig{0.7, 400};
  config.barge_in = BargeInConfig{options.initial_playback_guard_ms};
  config.history = HistoryConfig{10};
  config.greeting = StaticGreeting{"你好，我是 EVA。很高兴见到你，你可以告诉我现在想聊什么。"};
  config.system_prompt = "你是 EVA。请用自然中文简短回答，最多两句话，不使用 Markdown。";
  config.emotion = EmotionConfig{true};
  CommandsConfig commands;
  commands.registrations.push_back(make_clock_command());
  commands.registrations.push_back(make_indicator_command(std::make_shared<IndicatorState>()));
  config.commands = std::move(commands);
  config.transports.emplace(MediaTransports{std::move(input).value(), std::move(output).value(),
      std::move(aec).value(), std::move(camera)});
  if (options.camera) config.camera = CameraConfig{};
  return Agent::create(std::move(config));
}
