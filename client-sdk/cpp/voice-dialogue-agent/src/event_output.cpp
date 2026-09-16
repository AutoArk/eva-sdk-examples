#include "event_output.hpp"

#include <iostream>
#include <type_traits>
#include <variant>

namespace {
const char *media_role_name(eva::MediaRole role) {
  switch (role) {
  case eva::MediaRole::audio_input:
    return "audio_input";
  case eva::MediaRole::audio_output:
    return "audio_output";
  case eva::MediaRole::aec:
    return "aec";
  case eva::MediaRole::camera:
    return "camera";
  }
  return "unknown";
}

const char *media_operation_name(eva::MediaOperation operation) {
  switch (operation) {
  case eva::MediaOperation::start:
    return "start";
  case eva::MediaOperation::frames:
    return "frames";
  case eva::MediaOperation::stop:
    return "stop";
  case eva::MediaOperation::enqueue:
    return "enqueue";
  case eva::MediaOperation::flush:
    return "flush";
  case eva::MediaOperation::drain:
    return "drain";
  case eva::MediaOperation::process_near_end:
    return "process_near_end";
  case eva::MediaOperation::push_far_end:
    return "push_far_end";
  case eva::MediaOperation::reset:
    return "reset";
  case eva::MediaOperation::release:
    return "release";
  case eva::MediaOperation::capture:
    return "capture";
  }
  return "unknown";
}

const char *media_reason_name(eva::MediaReason reason) {
  switch (reason) {
  case eva::MediaReason::not_configured:
    return "not_configured";
  case eva::MediaReason::permission_denied:
    return "permission_denied";
  case eva::MediaReason::device_unavailable:
    return "device_unavailable";
  case eva::MediaReason::unsupported:
    return "unsupported";
  case eva::MediaReason::timeout:
    return "timeout";
  case eva::MediaReason::invalid_data:
    return "invalid_data";
  case eva::MediaReason::operation_failed:
    return "operation_failed";
  }
  return "unknown";
}

template <typename T>
void print_optional_ms(const char *name, const std::optional<T> &value) {
  if (value)
    std::cout << ' ' << name << '=' << *value << "ms";
}
} // namespace

void show_error(std::ostream &output, std::string_view action,
                const eva::Error &error) {
  output << "error: action=" << action
         << " source=" << eva::error_source_name(error.source())
         << " fatal=" << (error.fatal() ? "true" : "false")
         << " message=" << error.message();
  if (error.provider())
    output << " provider=" << *error.provider();
  if (error.status_code())
    output << " status_code=" << *error.status_code();
  if (error.role())
    output << " media_role=" << media_role_name(*error.role());
  if (error.operation())
    output << " media_operation=" << media_operation_name(*error.operation());
  if (error.reason())
    output << " media_reason=" << media_reason_name(*error.reason());
  if (error.trace_id())
    output << " trace_id=" << *error.trace_id();
  output << '\n';
}

void show_event(const eva::AgentEvent &event) {
  std::visit(
      [](const auto &value) {
        using T = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<T, eva::SpeechStartedEvent>) {
          std::cout << "speech.started\n";
        } else if constexpr (std::is_same_v<T, eva::SpeechStoppedEvent>) {
          std::cout << "speech.stopped\n";
        } else if constexpr (std::is_same_v<T, eva::TranscriptPartialEvent>) {
          std::cout << "transcript.partial: " << value.text << '\n';
        } else if constexpr (std::is_same_v<T, eva::TranscriptFinalEvent>) {
          std::cout << "transcript.final: " << value.text << '\n';
        } else if constexpr (std::is_same_v<T, eva::ReplyStartedEvent>) {
          std::cout << "reply.started\n";
        } else if constexpr (std::is_same_v<T, eva::ReplyPartialEvent>) {
          std::cout << "reply.partial: " << value.text << '\n';
        } else if constexpr (std::is_same_v<T, eva::ReplyFinalEvent>) {
          std::cout << "reply.final: " << value.text << '\n';
        } else if constexpr (std::is_same_v<T, eva::PlaybackStartedEvent>) {
          std::cout << "playback.started\n";
        } else if constexpr (std::is_same_v<T, eva::PlaybackStoppedEvent>) {
          std::cout << "playback.stopped\n";
        } else if constexpr (std::is_same_v<T, eva::EmotionDetectedEvent>) {
          std::cout << "emotion.detected: code=" << value.emotion_code
                    << " latency=" << value.latency_ms << "ms";
          if (value.confidence)
            std::cout << " confidence=" << *value.confidence;
          std::cout << '\n';
        } else if constexpr (std::is_same_v<T, eva::ImageCapturedEvent>) {
          std::cout << "image.captured: mime=" << value.mime_type
                    << " size=" << value.width << 'x' << value.height
                    << " bytes=" << value.size_bytes
                    << " capture=" << value.capture_ms << "ms\n";
        } else if constexpr (std::is_same_v<T, eva::InterruptionEvent>) {
          std::cout << "interruption: turn_id=" << value.turn_id << '\n';
        } else if constexpr (std::is_same_v<T, eva::CommandCalledEvent>) {
          std::cout << "command.called: " << value.command_name
                    << " call_id=" << value.call_id << '\n';
        } else if constexpr (std::is_same_v<T, eva::CommandCompletedEvent>) {
          std::cout << "command.completed: " << value.command_name
                    << " call_id=" << value.call_id;
          if (value.message)
            std::cout << " message=" << *value.message;
          std::cout << '\n';
        } else if constexpr (std::is_same_v<T, eva::CommandFailedEvent>) {
          std::cout << "command.failed: " << value.command_name
                    << " call_id=" << value.call_id
                    << " message=" << value.message << '\n';
        } else if constexpr (std::is_same_v<T, eva::TurnLatencyEvent>) {
          std::cout << "turn.latency:";
          print_optional_ms("vad", value.latency.stages.vad_ms);
          print_optional_ms("asr", value.latency.stages.asr_ms);
          print_optional_ms("llm_first",
                            value.latency.stages.llm_first_token_ms);
          print_optional_ms("tts_first",
                            value.latency.stages.tts_first_audio_ms);
          print_optional_ms("playback", value.latency.stages.playback_ms);
          print_optional_ms("total", value.latency.total_ms);
          std::cout << '\n';
        } else if constexpr (std::is_same_v<T, eva::ErrorEvent>) {
          show_error(std::cerr, "event", value.error);
        }
      },
      event);
}
