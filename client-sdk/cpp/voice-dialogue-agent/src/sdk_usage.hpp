#pragma once
#include <eva/agent.hpp>
#include <cstdint>
#include <optional>
#include <string>
struct Options {
  std::optional<std::string> input_device, output_device, camera_device;
  bool camera = false;
  double output_gain = 1.0;
  int aec_delay_ms = 60;
  std::int64_t initial_playback_guard_ms = 3000;
};
eva::Result<std::unique_ptr<eva::Agent>> create_agent(std::string key, const Options& options);
