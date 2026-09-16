#include "event_output.hpp"
#include "options.hpp"
#include "sdk_usage.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <eva/helpers.hpp>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <thread>
#include <unistd.h>
#include <variant>

namespace {
std::atomic<bool> quitting{false};
std::atomic<bool> runtime_failed{false};
static_assert(std::atomic<bool>::is_always_lock_free);
extern "C" void stop_signal(int) {
  quitting.store(true, std::memory_order_relaxed);
}
struct Completion {
  std::mutex mutex;
  std::condition_variable ready;
  std::optional<eva::Result<void>> result;
};

bool await(std::string_view action,
           const std::function<void(eva::Agent::Completion)> &operation) {
  auto state = std::make_shared<Completion>();
  operation([state](eva::Result<void> result) {
    {
      std::lock_guard<std::mutex> lock(state->mutex);
      state->result.emplace(std::move(result));
    }
    state->ready.notify_all();
  });
  std::unique_lock<std::mutex> lock(state->mutex);
  if (!state->ready.wait_for(lock, std::chrono::seconds(60),
                             [&] { return state->result.has_value(); })) {
    std::cerr << "error: action=" << action
              << " reason=timeout timeout_ms=60000\n";
    return false;
  }
  if (!*state->result) {
    show_error(std::cerr, action, state->result->error());
    return false;
  }
  return true;
}

int list_cameras() {
#if defined(__APPLE__)
  auto listed = eva::list_avfoundation_cameras();
  if (!listed) {
    show_error(std::cerr, "list_cameras", listed.error());
    return 1;
  }
  if (listed.value().empty())
    std::cout << "camera.devices: none\n";
  for (const auto &device : listed.value()) {
    std::cout << "camera.device: id=" << std::quoted(device.device_unique_id)
              << " name=" << std::quoted(device.display_name) << '\n';
  }
#else
  auto listed = eva::list_v4l2_cameras();
  if (!listed) {
    show_error(std::cerr, "list_cameras", listed.error());
    return 1;
  }
  if (listed.value().empty())
    std::cout << "camera.devices: none\n";
  for (const auto &device : listed.value()) {
    std::cout << "camera.device: path=" << std::quoted(device.device_path)
              << " name=" << std::quoted(device.display_name)
              << " driver=" << std::quoted(device.driver)
              << " bus=" << std::quoted(device.bus_info) << '\n';
  }
#endif
  return 0;
}
} // namespace

int main(int argc, char **argv) try {
  // The credential launcher captures stdout/stderr for redaction, so they are
  // pipes rather than terminals. Keep dialogue and diagnostics observable as
  // each event is emitted instead of buffering them until process exit.
  std::cout << std::unitbuf;
  std::cerr << std::unitbuf;
  const auto parsed = parse_options(argc, argv);
  if (parsed.show_help) {
    print_usage(std::cout);
    return 0;
  }
  if (parsed.options.list_cameras)
    return list_cameras();

  if (::isatty(STDIN_FILENO))
    throw std::runtime_error("请通过 key-file 启动入口传入凭证");
  std::string key;
  if (!std::getline(std::cin, key) || key.empty())
    throw std::runtime_error("缺少 Gateway key");
  auto created = create_agent(std::move(key), parsed.options);
  if (!created) {
    show_error(std::cerr, "create_agent", created.error());
    return 1;
  }
  auto agent = std::move(created).value();
  auto subscribed = agent->subscribe([](const eva::AgentEvent &event) {
    show_event(event);
    if (std::holds_alternative<eva::ErrorEvent>(event)) {
      runtime_failed = true;
      quitting = true;
    }
  });
  if (!subscribed) {
    show_error(std::cerr, "subscribe", subscribed.error());
    return 1;
  }
  auto subscription = std::move(subscribed).value();
  std::signal(SIGINT, stop_signal);
  std::signal(SIGTERM, stop_signal);
  // 先启用摄像头，再启动会话；拍照仍由后续语音触发。
  bool started =
      !parsed.options.camera || await("camera_enable", [&](auto done) {
        agent->set_camera_capture_enabled(true, std::move(done));
      });
  started = started && await("agent_start",
                             [&](auto done) { agent->start(std::move(done)); });
  if (started) {
    std::cout << "会话已开始，请直接说话。Ctrl+C 退出。\n" << std::flush;
    while (!quitting.load())
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  const bool stopped =
      await("agent_stop", [&](auto done) { agent->stop(std::move(done)); });
  subscription.unsubscribe();
  agent.reset();
  return started && stopped && !runtime_failed.load() ? 0 : 1;
} catch (const std::exception &error) {
  std::cerr << "voice.demo.error: " << error.what() << '\n';
  return 1;
}
