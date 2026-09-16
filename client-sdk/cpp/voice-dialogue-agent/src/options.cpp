#include "options.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace {
std::string require_value(int argc, char **argv, int &index) {
  if (++index == argc || std::string(argv[index]).empty()) {
    throw std::runtime_error("参数缺少值");
  }
  return argv[index];
}

std::int64_t parse_integer(const std::string &value, const std::string &name) {
  std::size_t consumed = 0;
  const auto parsed = std::stoll(value, &consumed);
  if (consumed != value.size())
    throw std::runtime_error(name + " 必须是整数");
  return parsed;
}
} // namespace

ParsedOptions parse_options(int argc, char **argv) {
  ParsedOptions parsed;
  for (int index = 1; index < argc; ++index) {
    const std::string flag = argv[index];
    if (flag == "--help") {
      parsed.show_help = true;
    } else if (flag == "--camera") {
      parsed.options.camera = true;
    } else if (flag == "--list-cameras") {
      parsed.options.list_cameras = true;
    } else if (flag == "--no-emotion") {
      parsed.options.emotion = false;
    } else if (flag == "--input-device") {
      parsed.options.input_device = require_value(argc, argv, index);
    } else if (flag == "--output-device") {
      parsed.options.output_device = require_value(argc, argv, index);
    } else if (flag == "--camera-device") {
      parsed.options.camera_device = require_value(argc, argv, index);
    } else if (flag == "--tts-model") {
      parsed.options.tts_model = require_value(argc, argv, index);
    } else if (flag == "--tts-voice") {
      parsed.options.tts_voice = require_value(argc, argv, index);
    } else if (flag == "--output-gain") {
      const auto value = require_value(argc, argv, index);
      std::size_t consumed = 0;
      parsed.options.output_gain = std::stod(value, &consumed);
      if (consumed != value.size() ||
          !std::isfinite(parsed.options.output_gain) ||
          parsed.options.output_gain < 0 || parsed.options.output_gain > 1) {
        throw std::runtime_error("output-gain 必须是0到1之间的有限数值");
      }
    } else if (flag == "--aec-delay-ms") {
      const auto value =
          parse_integer(require_value(argc, argv, index), "aec-delay-ms");
      if (value < 0 || value > 500)
        throw std::runtime_error("aec-delay-ms 必须是0到500之间的整数");
      parsed.options.aec_delay_ms = static_cast<int>(value);
    } else if (flag == "--initial-playback-guard-ms") {
      const auto value = parse_integer(require_value(argc, argv, index),
                                       "initial-playback-guard-ms");
      if (value < 0)
        throw std::runtime_error("initial-playback-guard-ms 必须是非负整数");
      parsed.options.initial_playback_guard_ms = value;
    } else if (flag == "--tts-sample-rate") {
      const auto value =
          parse_integer(require_value(argc, argv, index), "tts-sample-rate");
      if (value <= 0)
        throw std::runtime_error("tts-sample-rate 必须是正整数");
      parsed.options.tts_sample_rate = value;
    } else {
      throw std::runtime_error("未知参数: " + flag);
    }
  }

  if (parsed.show_help || parsed.options.list_cameras)
    return parsed;
  if (parsed.options.camera_device && !parsed.options.camera) {
    throw std::runtime_error("相机设备需同时指定 --camera");
  }
#if defined(__APPLE__)
  if (parsed.options.input_device || parsed.options.output_device) {
    throw std::runtime_error("Mac 使用系统默认音频设备，ALSA 参数仅适用 Linux");
  }
#else
  if (!parsed.options.input_device || !parsed.options.output_device) {
    throw std::runtime_error("Linux 需明确指定 ALSA 输入与输出设备");
  }
#endif
  return parsed;
}

void print_usage(std::ostream &output) {
  output << "EVA C++ 语音对话示例\n"
         << "--list-cameras 列出可用相机后退出\n"
         << "--camera [--camera-device ID_OR_PATH] 启用相机\n"
         << "--input-device ALSA_NAME --output-device ALSA_NAME 指定 Linux "
            "音频设备\n"
         << "--output-gain 0..1 设置输出软件音量，默认1，不修改系统音量\n"
         << "--aec-delay-ms 0..500 设置输入输出路由时延，默认60\n"
         << "--initial-playback-guard-ms N "
            "设置首次播放保护窗口，默认3000，0表示关闭\n"
         << "--tts-model NAME --tts-voice NAME --tts-sample-rate HZ 覆盖 TTS "
            "配置\n"
         << "--no-emotion 关闭情绪识别\n"
         << "--help 显示帮助。使用 scripts/run-with-key-file.mjs 启动；Ctrl+C "
            "退出。\n";
}
