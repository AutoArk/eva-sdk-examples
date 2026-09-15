#pragma once
#include <eva/command.hpp>
#include <array>
#include <chrono>
#include <ctime>
#include <iostream>
#include <string>
#include <utility>

// 将返回值加入 AgentConfig.commands.registrations 即可注册到真实对话。
// 此程序只演示客户 handler，不访问网络、麦克风或相机。
eva::CommandRegistration make_clock_command() {
  eva::CommandRegistration registration;
  registration.definition.name = "get_current_time";
  registration.definition.description =
      "获取当前设备本地日期、时间和时区。回答应直接采用工具结果，不自行换算。";
  registration.handler = [](const eva::CommandCall&, const eva::CommandContext&,
                            const eva::CancellationToken& signal,
                            eva::CommandResultCallback complete) {
    if (signal.cancelled()) {
      complete({false, "调用已取消", std::nullopt});
      return;
    }
    const auto now = std::chrono::system_clock::now();
    const auto seconds = std::chrono::system_clock::to_time_t(now);
    std::tm local{};
    if (::localtime_r(&seconds, &local) == nullptr) {
      complete({false, "无法读取当前本地时间", std::nullopt});
      return;
    }
    std::array<char, 96> formatted{};
    if (::strftime(formatted.data(), formatted.size(),
                   "%Y-%m-%d %H:%M:%S %Z (UTC%z)", &local) == 0) {
      complete({false, "无法格式化当前本地时间", std::nullopt});
      return;
    }
    const std::string local_time(formatted.data());
    const auto milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
    eva::JsonValue::Object data;
    data.emplace("local_time", eva::JsonValue::string(local_time).value());
    data.emplace("unix_ms", eva::JsonValue(static_cast<std::int64_t>(milliseconds)));
    complete({true, "当前本地时间是 " + local_time + "。", std::move(data)});
  };
  return registration;
}

#include <eva/command.hpp>
#include <iostream>
#include <memory>
#include <mutex>
#include <utility>

// 用进程内状态模拟业务开关；接入实际设备时由客户替换业务操作。
struct IndicatorState {
  std::mutex mutex;
  bool enabled = false;
};

eva::CommandRegistration make_indicator_command(std::shared_ptr<IndicatorState> state) {
  eva::CommandRegistration registration;
  registration.definition.name = "set_indicator";
  registration.definition.description = "设置示例指示器开关";
  eva::CommandParameter parameter;
  parameter.name = "enabled";
  parameter.type = eva::CommandParameterType::boolean;
  parameter.required = true;
  parameter.description = "true 开启，false 关闭";
  registration.definition.parameters.push_back(std::move(parameter));
  registration.handler = [state = std::move(state)](
      const eva::CommandCall& call, const eva::CommandContext&,
      const eva::CancellationToken& signal, eva::CommandResultCallback complete) {
    if (signal.cancelled()) {
      complete({false, "调用已取消", std::nullopt});
      return;
    }
    const auto found = call.arguments.find("enabled");
    const auto* enabled = found == call.arguments.end()
        ? nullptr : std::get_if<bool>(&found->second.storage());
    if (!enabled || !state) {
      complete({false, "需要 enabled 布尔参数及有效业务状态", std::nullopt});
      return;
    }
    {
      std::lock_guard<std::mutex> lock(state->mutex);
      state->enabled = *enabled;
    }
    eva::JsonValue::Object data;
    data.emplace("enabled", eva::JsonValue(*enabled));
    complete({true, "示例指示器已更新", std::move(data)});
  };
  return registration;
}
