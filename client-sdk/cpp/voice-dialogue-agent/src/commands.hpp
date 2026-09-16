#pragma once

#include <eva/command.hpp>
#include <memory>
#include <mutex>

// 用进程内状态模拟业务开关；接入实际设备时由客户替换业务操作。
struct IndicatorState {
  std::mutex mutex;
  bool enabled = false;
};

eva::CommandRegistration make_clock_command();
eva::CommandRegistration
make_indicator_command(std::shared_ptr<IndicatorState> state);
