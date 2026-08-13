# EVA Python Voice Dialogue Agent

这个终端 demo 使用 EVA Python Client SDK 公共 facade 运行真实
`microphone -> VAD -> ASR -> LLM -> TTS -> speaker` 链路，并保留 native AEC、Emotion、
Command 与可选 camera 图片问答。SDK 接入主路径集中在 `sdk_usage.py`；终端生命周期在
`main.py`，音频设备与 AEC、commands、事件输出分别放在独立模块。

当前 demo 状态为 `dev`，精确消费 `pyproject.toml` 与 `uv.lock` 锁定的 PyPI 正式版。

## 准备环境

Python 依赖只用 uv 管理。先从仓库内任意目录定位 demo；本页后续命令复用这两个绝对路径，
并通过 `--directory` 选择 uv 项目，不会改变当前 shell 的工作目录。打开新 shell 后先重新执行前两行：

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
DEMO_DIR="$REPO_ROOT/client-sdk/python/voice-dialogue-agent"
python3 "$DEMO_DIR/check_env.py"
uv sync --directory "$DEMO_DIR" --frozen
```

`check_env.py` 检查 Python 3.11+、C compiler、PortAudio runtime 与 `portaudio.h`，失败时会打印
macOS 或 Ubuntu/Debian 的可复制修复命令。EVA SDK 通过 uv explicit named source 提供 PyPI
依赖；NumPy、PyAudio、OpenCV、ONNX Runtime 等第三方依赖同样从正式 PyPI 解析。项目不使用 SDK
checkout、本地 path、workspace 或本地 wheel。

## 选择设备

```bash
uv run --directory "$DEMO_DIR" --frozen python main.py --list-devices
```

设备列表包含 host API、index、输入/输出 channel 与默认采样率。省略 index 时使用 PortAudio 默认
route；也可以显式选择：

```bash
uv run --directory "$DEMO_DIR" --frozen python main.py \
  --input-device 1 \
  --output-device 2 \
  --input-sample-rate 48000
```

## 使用 key 文件启动

key 文件保存在仓库外，例如：

```dotenv
EVA_GATEWAY_API_KEY=填你的真实AK
```

launcher 只从文件路径读取 key，忽略其他变量，不执行 shell 内容，也不打印 key 值。`--` 后的参数
原样传给 demo：

```bash
uv run --directory "$DEMO_DIR" --frozen python run_with_key_file.py /absolute/path/to/key-file -- \
  --input-device 1 \
  --output-device 2
```

启动后直接说话；停顿约 0.4 秒后会看到转写、回复和播放事件。按回车退出，`agent.stop()` 会释放
麦克风、扬声器、AEC 与 camera 资源。

## AEC 与声音

完整 wheel 默认从包内加载 `eva-webrtc-aec3`。默认 TTS 是
`ark-tts-flash` / `zh_en_male_evan` / 44.1 kHz；可用 `--tts-model`、`--tts-voice` 和
`--tts-sample-rate` 覆盖。native AEC 接受 8–48 kHz、可形成精确 10 ms frame 的 mono PCM
S16LE capture/render rate。

```bash
# 默认启用 packaged native AEC，delay 为 60 ms
EVA_AEC=1 EVA_AEC_DELAY_MS=60 \
uv run --directory "$DEMO_DIR" --frozen python run_with_key_file.py /absolute/path/to/key-file

# 耳机或系统已有 AEC 时使用 passthrough 基线
EVA_AEC=0 \
uv run --directory "$DEMO_DIR" --frozen python run_with_key_file.py /absolute/path/to/key-file
```

`EVA_AEC_LIBRARY` 只用于显式自定义 native library；registry consumer 验收不要设置它，否则不能证明
wheel 自带 library 的身份。AEC 效果依赖设备 route、音量、房间与 delay，自动安装检查不替代开放
扬声器 + 麦克风真机验收。

## Camera、Emotion 与 Command

Emotion 默认开启，每轮产生 `emotion.detected`；`--no-emotion` 可关闭。camera 依赖已经由 SDK
`camera` extra 安装，不会等到运行时才缺 OpenCV：

```bash
uv run --directory "$DEMO_DIR" --frozen python run_with_key_file.py /absolute/path/to/key-file -- \
  --camera \
  --input-device 1 \
  --output-device 2
```

启用后，默认 camera 在每个语音 turn 至多抓一张当前图片；事件只打印 MIME、尺寸、字节数和耗时，
不保存图片。demo 还注册了两个本地无副作用 command：说“现在几点”触发 `get_current_time`；说
“把 25 摄氏度换算成华氏度”触发 `convert_temperature`。成功路径会依次打印
`command.called`、`command.completed`，随后由 TTS 播报结果。

## 自动检查与人工边界

```bash
uv run --directory "$DEMO_DIR" --frozen python -m pytest
node "$REPO_ROOT/scripts/verify-catalog.mjs"
```

仓库 skill `$verify-eva-python-demo-registry` 会进一步核对公开 registry wheel 文件名/SHA、安装和
import 版本、packaged native AEC 文件与 ABI identity。上述自动 PASS 只证明 consumer 安装与机器门；
Gateway、语音 turn、TTS、开放扬声器 AEC 效果、camera 画面语义和 stop 后真实设备释放必须单独人工
运行，未运行时只能记 `NOT_RUN`，不能记 device PASS。

## 排障

- **终端没有收到声音或没有播放声音**：Python demo 运行在命令行中，不会像 Browser demo 那样弹出浏览器麦克风/扬声器授权框。操作系统会按“启动 demo 的终端应用”授予音频权限；某些第三方终端、IDE 内置终端或受限制的命令行宿主可能没有权限，导致输入或输出设备不可用。先在系统设置中为当前终端应用开启麦克风和音频输出权限，再用系统自带 Terminal（macOS Terminal，或 Linux 的系统终端）启动本 demo 重试；必要时重新启动终端应用后再运行 `check_env.py` 和 `--list-devices`。
- `audio.devices: none`：确认系统音频设备、route 与终端录音权限。
- `audio-input/output device ...`：重新运行 `--list-devices`，选择角色正确的 index。
- `mic.level` 长期接近 0：检查 input index、硬件静音和系统权限。
- PyAudio 构建失败：重新运行 `python3 "$DEMO_DIR/check_env.py"`，按其命令补齐 compiler 与
  PortAudio headers。
- camera 打不开：确认摄像头权限与设备未被其他进程占用；本 demo 不定义权限/设备缺失降级。
