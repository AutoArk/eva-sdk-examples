#include <cmath>
#include "sdk_usage.hpp"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <unistd.h>

namespace {
std::atomic<bool> quitting{false};
std::atomic<bool> runtime_failed{false};
static_assert(std::atomic<bool>::is_always_lock_free);
extern "C" void stop_signal(int) { quitting.store(true, std::memory_order_relaxed); }
struct Completion { std::mutex mutex; std::condition_variable ready; bool done=false; bool ok=false; };
bool await(const std::function<void(eva::Agent::Completion)>& operation) {
  auto state=std::make_shared<Completion>();
  operation([state](eva::Result<void> result) {
    { std::lock_guard<std::mutex> lock(state->mutex); state->ok=static_cast<bool>(result); state->done=true; }
    state->ready.notify_all();
  });
  std::unique_lock<std::mutex> lock(state->mutex);
  return state->ready.wait_for(lock,std::chrono::seconds(60),[&]{return state->done;}) && state->ok;
}
void usage() {
  std::cout << "EVA 语音对话示例\n"
    "--camera [--camera-device ID_OR_PATH] 启用相机\n"
    "--input-device ALSA_NAME --output-device ALSA_NAME 指定 Linux 音频设备\n"
    "--output-gain 0..1 设置此输出的软件音量，默认1，不修改系统音量\n"
    "--aec-delay-ms 0..500 设置输入输出路由时延，默认60\n"
    "--initial-playback-guard-ms N 设置首次播放保护窗口，默认3000，0表示关闭\n"
    "--help 显示帮助。使用 scripts/run-with-key-file.mjs 启动；Ctrl+C 退出。\n";
}
}
int main(int argc,char** argv) try {
  // The credential launcher captures stdout/stderr for redaction, so they are
  // pipes rather than terminals. Keep dialogue and diagnostics observable as
  // each event is emitted instead of buffering them until process exit.
  std::cout << std::unitbuf;
  std::cerr << std::unitbuf;
  Options options;
  for(int i=1;i<argc;++i) {
    const std::string flag=argv[i];
    if(flag=="--help") { usage(); return 0; }
    if(flag=="--camera") { options.camera=true; continue; }
    if(flag!="--input-device" && flag!="--output-device" && flag!="--camera-device" && flag!="--output-gain" && flag!="--aec-delay-ms" && flag!="--initial-playback-guard-ms") throw std::runtime_error("未知参数");
    if(++i==argc || std::string(argv[i]).empty()) throw std::runtime_error("参数缺少值");
    if(flag=="--output-gain") {
      const std::string value=argv[i]; std::size_t consumed=0;
      options.output_gain=std::stod(value,&consumed);
      if(consumed!=value.size() || !std::isfinite(options.output_gain) || options.output_gain<0 || options.output_gain>1)
        throw std::runtime_error("output-gain 必须是0到1之间的有限数值");
    }
    else if(flag=="--aec-delay-ms") {
      const std::string value=argv[i]; std::size_t consumed=0;
      const long parsed=std::stol(value,&consumed);
      if(consumed!=value.size() || parsed<0 || parsed>500) throw std::runtime_error("aec-delay-ms 必须是0到500之间的整数");
      options.aec_delay_ms=static_cast<int>(parsed);
    }
    else if(flag=="--initial-playback-guard-ms") {
      const std::string value=argv[i]; std::size_t consumed=0;
      const long long parsed=std::stoll(value,&consumed);
      if(consumed!=value.size() || parsed<0) throw std::runtime_error("initial-playback-guard-ms 必须是非负整数");
      options.initial_playback_guard_ms=static_cast<std::int64_t>(parsed);
    }
    else if(flag=="--input-device") options.input_device=argv[i];
    else if(flag=="--output-device") options.output_device=argv[i];
    else options.camera_device=argv[i];
  }
  if(options.camera_device && !options.camera) throw std::runtime_error("相机设备需同时指定 --camera");
#if defined(__APPLE__)
  if(options.input_device || options.output_device) throw std::runtime_error("Mac 使用系统默认音频设备，ALSA 参数仅适用 Linux");
#else
  if(!options.input_device || !options.output_device) throw std::runtime_error("Linux 需明确指定 ALSA 输入与输出设备");
#endif
  if(::isatty(STDIN_FILENO)) throw std::runtime_error("请通过 key-file 启动入口传入凭证");
  std::string key;
  if(!std::getline(std::cin,key) || key.empty()) throw std::runtime_error("缺少 Gateway key");
  auto created=create_agent(std::move(key),options);
  if(!created) throw std::runtime_error("Agent 创建失败："+created.error().message());
  auto agent=std::move(created).value();
  auto subscribed=agent->subscribe([](const eva::AgentEvent& event) {
    std::visit([](const auto& value) {
      using T=std::decay_t<decltype(value)>;
      if constexpr(std::is_same_v<T,eva::TranscriptFinalEvent>) std::cout << "你：" << value.text << '\n';
      else if constexpr(std::is_same_v<T,eva::ReplyFinalEvent>) std::cout << "EVA：" << value.text << '\n';
      else if constexpr(std::is_same_v<T,eva::EmotionDetectedEvent>) std::cout << "情绪：" << value.emotion_code << '\n';
      else if constexpr(std::is_same_v<T,eva::CommandCompletedEvent>) std::cout << "工具：" << value.command_name << '\n';
      else if constexpr(std::is_same_v<T,eva::ImageCapturedEvent>) std::cout << "已拍摄：" << value.width << 'x' << value.height << '\n';
      else if constexpr(std::is_same_v<T,eva::InterruptionEvent>) std::cout << "已打断播放\n";
      else if constexpr(std::is_same_v<T,eva::ErrorEvent>) { std::cerr << "运行错误：" << value.error.message() << '\n'; runtime_failed=true; quitting=true; }
    },event);
  });
  if(!subscribed) throw std::runtime_error("订阅失败");
  auto subscription=std::move(subscribed).value();
  std::signal(SIGINT,stop_signal); std::signal(SIGTERM,stop_signal);
  // 先启用摄像头，再启动会话；拍照仍由后续语音触发。
  bool started=!options.camera || await([&](auto done){agent->set_camera_capture_enabled(true,std::move(done));});
  started=started && await([&](auto done){agent->start(std::move(done));});
  if(started) {
    std::cout << "会话已开始，请直接说话。Ctrl+C 退出。\n" << std::flush;
    while(!quitting.load()) std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  const bool stopped=await([&](auto done){agent->stop(std::move(done));});
  subscription.unsubscribe(); agent.reset();
  return started && stopped && !runtime_failed.load() ? 0 : 1;
} catch(const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
