#pragma once

#include <cstdint>
#include <iosfwd>
#include <optional>
#include <string>

struct Options {
  std::optional<std::string> input_device;
  std::optional<std::string> output_device;
  std::optional<std::string> camera_device;
  bool camera = false;
  bool emotion = true;
  bool list_cameras = false;
  double output_gain = 1.0;
  int aec_delay_ms = 60;
  std::int64_t initial_playback_guard_ms = 3000;
  std::string tts_model = "ark-tts-flash";
  std::string tts_voice = "zh_female_kido";
  std::int64_t tts_sample_rate = 44100;
};

struct ParsedOptions {
  Options options;
  bool show_help = false;
};

ParsedOptions parse_options(int argc, char **argv);
void print_usage(std::ostream &output);
