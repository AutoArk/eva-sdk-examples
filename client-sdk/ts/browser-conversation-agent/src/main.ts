import {
  startEvaAgent,
  type AgentEvent,
  type EvaVoiceDialogueAgent,
} from "./sdk-usage";
import "./styles.css";

/**
 * Demo 页面层。
 *
 * 可复制的 SDK 创建/启动主路径集中在 ./sdk-usage.ts；本文件负责 DOM、AK 弹窗、
 * 按钮状态、事件展示和日志，并通过 SDK 的 public Facade 驱动会话。
 */

// Demo 页面状态与 DOM wiring。
const environmentApiKey = normalizeApiKey(import.meta.env.VITE_EVA_API_KEY);
let manualApiKey: string | undefined;
let agent: EvaVoiceDialogueAgent | undefined;
let unsubscribe: (() => void) | undefined;
let audioInputEnabled = true;
let ttsEnabled = true;
let cameraEnabled = false;
let mediaControlsLocked = false;
let callStartedAt: number | undefined;
let callTimer: number | undefined;

type VoiceStageState =
  | "idle"
  | "starting"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

const startButton = element<HTMLButtonElement>("start");
const stopButton = element<HTMLButtonElement>("stop");
const audioInputButton = element<HTMLButtonElement>("audio-input");
const ttsButton = element<HTMLButtonElement>("tts");
const cameraButton = element<HTMLButtonElement>("camera");
const form = element<HTMLFormElement>("text-form");
const textInput = element<HTMLInputElement>("text");
const submitButton = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
const clearLogButton = element<HTMLButtonElement>("clear-log");
const apiKeyDialog = element<HTMLDialogElement>("api-key-dialog");
const apiKeyForm = element<HTMLFormElement>("api-key-form");
const apiKeyInput = element<HTMLInputElement>("api-key-input");
const apiKeyError = element<HTMLParagraphElement>("api-key-error");
const apiKeyCancelButton = element<HTMLButtonElement>("api-key-cancel");
const voiceStage = element<HTMLElement>("voice-stage");
const conversationEmpty = element<HTMLElement>("conversation-empty");
const callDuration = element<HTMLElement>("call-duration");

startButton.addEventListener("click", () => void start());
stopButton.addEventListener("click", () => void stop());
audioInputButton.addEventListener("click", () => void toggleAudioInput());
ttsButton.addEventListener("click", () => void toggleTts());
cameraButton.addEventListener("click", () => void toggleCamera());
form.addEventListener("submit", (event) => void submit(event));
clearLogButton.addEventListener("click", () => {
  element<HTMLTextAreaElement>("activity-log").value = "";
});
apiKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (normalizeApiKey(apiKeyInput.value) === undefined) {
    apiKeyError.textContent = "请输入有效的 Gateway AK";
    apiKeyInput.focus();
    return;
  }
  apiKeyDialog.close("confirm");
});
apiKeyCancelButton.addEventListener("click", () => apiKeyDialog.close("cancel"));

async function start(): Promise<void> {
  if (agent !== undefined) return;
  setBusy(true);
  try {
    const apiKey = await resolveApiKey();
    if (apiKey === undefined) {
      setText("status", "未启动；未提供 AK");
      setVoiceState("idle", "准备好聊聊了吗？", "启动后直接开口，EVA 会实时听见并回应你。");
      return;
    }
    setMediaControlsLocked(true);
    setText("status", "启动中…");
    setVoiceState("starting", "正在连接 EVA", "请稍候，我们正在准备麦克风和语音通道。");
    setText("microphone", audioInputEnabled ? "请求权限中…" : "已禁用");

    /**
     * ========================================================================
     * SDK 接入入口：从这里进入 sdk-usage.ts
     * Media SPI 组合、Agent 创建、事件订阅与 start() 都集中在 startEvaAgent()。
     * ========================================================================
     */
    const started = await startEvaAgent({
      apiKey,
      audioInputEnabled,
      ttsEnabled,
      cameraEnabled,
      onEvent: handleEvent,
    });
    agent = started.agent;
    unsubscribe = started.unsubscribe;
    setText("status", "已接通");
    setVoiceState(
      audioInputEnabled ? "ready" : "idle",
      audioInputEnabled ? "通话已接通" : "语音输入已关闭",
      audioInputEnabled ? "直接开口即可，EVA 在听。" : "打开麦克风，或使用下方文字输入。",
    );
    setText("microphone", audioInputEnabled ? "已连接" : "已禁用");
    setText("camera-status", cameraEnabled ? "持续连接；说话时采一张图" : "默认关闭");
    setSessionConnected(true);
    submitButton.disabled = false;
    setMediaControlsLocked(false);
  } catch (error) {
    setText("status", "启动失败");
    setVoiceState("error", "连接没有成功", "请检查 AK、网络与设备权限后重试。");
    setText("microphone", "不可用");
    setText("error", error instanceof Error ? error.message : String(error));
    unsubscribe?.();
    unsubscribe = undefined;
    agent = undefined;
    setSessionConnected(false);
    setMediaControlsLocked(false);
  } finally {
    setBusy(false);
    startButton.disabled = agent !== undefined;
  }
}

// Demo-only：允许静态部署页面在启动时取得 AK，不属于 SDK API。
async function resolveApiKey(): Promise<string | undefined> {
  if (environmentApiKey !== undefined) return environmentApiKey;
  if (manualApiKey !== undefined) return manualApiKey;
  const candidate = await requestManualApiKey();
  if (candidate !== undefined) manualApiKey = candidate;
  return candidate;
}

function requestManualApiKey(): Promise<string | undefined> {
  apiKeyInput.value = "";
  apiKeyError.textContent = "";
  apiKeyDialog.returnValue = "";

  return new Promise((resolve) => {
    apiKeyDialog.addEventListener("close", () => {
      const candidate = apiKeyDialog.returnValue === "confirm"
        ? normalizeApiKey(apiKeyInput.value)
        : undefined;
      apiKeyInput.value = "";
      resolve(candidate);
    }, { once: true });
    apiKeyDialog.showModal();
    apiKeyInput.focus();
  });
}

function normalizeApiKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined
    || normalized.length === 0
    || normalized.startsWith("replace-")
    ? undefined
    : normalized;
}

// Demo 控件：分别调用 SDK public Facade 的 stop / media control / submitText。
async function stop(): Promise<void> {
  const current = agent;
  if (current === undefined) return;
  agent = undefined;
  submitButton.disabled = true;
  stopButton.disabled = true;
  startButton.disabled = true;
  stopCallTimer();
  setMediaControlsLocked(true);
  setText("status", "停止中…");
  setVoiceState("processing", "正在结束会话", "EVA 正在释放本次会话使用的设备。");
  try {
    await current.stop();
    renderMessages(current);
    setText("status", "通话已结束；再次启动会创建新会话");
    setVoiceState("idle", "本次对话已结束", "再次启动会创建一个新的会话。");
    setText("microphone", "已释放");
    setText("camera-status", "已释放");
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  } finally {
    unsubscribe?.();
    unsubscribe = undefined;
    setSessionConnected(false);
    startButton.disabled = false;
  }
}

async function toggleAudioInput(): Promise<void> {
  if (audioInputButton.disabled) return;
  const next = !audioInputEnabled;
  audioInputButton.disabled = true;
  try {
    await agent?.setAudioInputEnabled(next);
    audioInputEnabled = next;
    setSwitchState(audioInputButton, audioInputEnabled);
    if (agent !== undefined) {
      setVoiceState(
        audioInputEnabled ? "ready" : "idle",
        audioInputEnabled ? "我在听" : "语音输入已关闭",
        audioInputEnabled ? "继续说，EVA 会自然接着聊。" : "打开麦克风，或使用下方文字输入。",
      );
    }
    setText("microphone", audioInputEnabled
      ? (agent === undefined ? "启动时启用" : "已连接")
      : (agent === undefined ? "启动时禁用" : "已释放"));
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  } finally {
    audioInputButton.disabled = mediaControlsLocked;
  }
}

async function toggleTts(): Promise<void> {
  if (ttsButton.disabled) return;
  const next = !ttsEnabled;
  ttsButton.disabled = true;
  try {
    await agent?.setTtsEnabled(next);
    ttsEnabled = next;
    setSwitchState(ttsButton, ttsEnabled);
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  } finally {
    ttsButton.disabled = mediaControlsLocked;
  }
}

async function toggleCamera(): Promise<void> {
  if (cameraButton.disabled) return;
  const next = !cameraEnabled;
  cameraButton.disabled = true;
  try {
    await agent?.setCameraCaptureEnabled(next);
    cameraEnabled = next;
    setSwitchState(cameraButton, cameraEnabled);
    setText("camera-status", cameraEnabled
      ? (agent === undefined ? "启动时启用" : "持续连接；说话时采一张图")
      : (agent === undefined ? "启动时关闭" : "已释放"));
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  } finally {
    cameraButton.disabled = mediaControlsLocked;
  }
}

async function submit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const text = textInput.value.trim();
  const current = agent;
  if (current === undefined || text.length === 0) return;
  textInput.value = "";
  try {
    await current.submitText(text, { metadata: { channel: "ts-browser-demo" } });
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  }
}

// SDK event → Demo 页面投影。Emotion / Command 配置是可选的，但 AgentEvent
// 仍表示完整公共事件目录，因此这里保留所有分支并用 never 做穷尽检查。
function handleEvent(event: AgentEvent, sourceAgent: EvaVoiceDialogueAgent): void {
  switch (event.type) {
    case "speech.started":
      setText("microphone", "检测到说话");
      setVoiceState("listening", "我在听", "继续说，停顿后 EVA 会自动理解并回应。");
      return;
    case "image.captured":
      setText(
        "camera-status",
        `${event.image.mimeType} · ${event.image.width}×${event.image.height} · ${event.image.sizeBytes} bytes · ${event.image.captureMs} ms`,
        event.type,
      );
      return;
    case "speech.stopped":
      setText("microphone", "识别中…");
      setVoiceState("processing", "正在理解", "EVA 正在整理刚才听到的内容。");
      return;
    case "transcript.partial":
      setText("transcript", event.text, event.type);
      setVoiceState("listening", "我在听", event.text);
      return;
    case "transcript.final":
      setText("transcript", event.text, event.type);
      renderMessages(sourceAgent);
      return;
    case "interruption":
      setText("interruption", `${event.reason} · ${event.turnId}`);
      return;
    case "reply.started":
      setText("reply", "…", event.type);
      setVoiceState("processing", "正在组织回应", "马上就好。");
      return;
    case "reply.partial":
      element("reply").textContent += event.text;
      return;
    case "reply.final":
      setText("reply", event.text, event.type);
      renderMessages(sourceAgent);
      if (!ttsEnabled) {
        setVoiceState(
          audioInputEnabled ? "ready" : "idle",
          audioInputEnabled ? "我在听" : "语音输入已关闭",
          audioInputEnabled ? "继续说，EVA 会自然接着聊。" : "打开麦克风，或使用下方文字输入。",
        );
      }
      return;
    case "playback.started":
      setText("status", "播放回复");
      setVoiceState("speaking", "EVA 正在说话", "你可以随时开口打断。");
      return;
    case "playback.stopped":
      setText("status", "已接通");
      setVoiceState(
        audioInputEnabled ? "ready" : "idle",
        audioInputEnabled ? "我在听" : "语音输入已关闭",
        audioInputEnabled ? "继续说，EVA 会自然接着聊。" : "打开麦克风，或使用下方文字输入。",
      );
      return;
    case "turn.latency":
      setText("latency", JSON.stringify(event.latency, null, 2));
      return;
    case "emotion.detected":
      setText(
        "emotion",
        `${event.emotionCode} · ${event.source} · confidence ${event.confidence?.toFixed(3) ?? "—"} · ${event.latencyMs} ms · 「${event.textPreview}」`,
        event.type,
      );
      return;
    case "command.called":
      setText(
        "command",
        `调用中 · ${event.call.name} · ${event.call.argumentsJson}`,
        event.type,
      );
      return;
    case "command.completed":
      setText(
        "command",
        `已完成 · ${event.call.name} · ${event.result.message ?? "成功"}${formatCommandData(event.result.data)}`,
        event.type,
      );
      return;
    case "command.failed":
      setText(
        "command",
        `失败 · ${event.call.name} · ${event.result.message}${formatCommandData(event.result.data)}`,
        event.type,
      );
      return;
    case "error":
      if (event.error.source === "media" && event.error.role === "camera") {
        if (event.error.operation === "start") {
          cameraEnabled = false;
          setSwitchState(cameraButton, false);
          setText("camera-status", "不可用或未授权");
        }
      } else {
        setVoiceState("error", "遇到了一点问题", "请查看开发者诊断，或结束会话后重试。");
      }
      setText("error", JSON.stringify(event.error, null, 2));
      return;
    default:
      event satisfies never;
      return;
  }
}

function formatCommandData(data: unknown): string {
  return data === undefined ? "" : ` · ${JSON.stringify(data)}`;
}

// Demo-only 渲染与日志 helper。
function renderMessages(source: EvaVoiceDialogueAgent): void {
  const list = element<HTMLOListElement>("messages");
  const messages = source.getMessages();
  conversationEmpty.hidden = messages.length > 0;
  list.replaceChildren(...messages.map((message) => {
    const item = document.createElement("li");
    item.className = message.role;
    const label = document.createElement("strong");
    label.textContent = message.role === "user" ? "你" : "EVA";
    const content = document.createElement("span");
    content.textContent = message.content;
    item.append(label, content);
    return item;
  }));
}

function setBusy(busy: boolean): void {
  startButton.disabled = busy;
  if (busy) submitButton.disabled = true;
}

function setMediaControlsLocked(locked: boolean): void {
  mediaControlsLocked = locked;
  audioInputButton.disabled = locked;
  ttsButton.disabled = locked;
  cameraButton.disabled = locked;
}

function setSessionConnected(connected: boolean): void {
  startButton.hidden = connected;
  stopButton.hidden = !connected;
  stopButton.disabled = !connected;
  if (connected) startCallTimer();
  else stopCallTimer();
}

function startCallTimer(): void {
  stopCallTimer();
  callStartedAt = Date.now();
  callDuration.hidden = false;
  renderCallDuration();
  callTimer = window.setInterval(renderCallDuration, 1_000);
}

function stopCallTimer(): void {
  if (callTimer !== undefined) window.clearInterval(callTimer);
  callTimer = undefined;
  callStartedAt = undefined;
  callDuration.hidden = true;
}

function renderCallDuration(): void {
  if (callStartedAt === undefined) return;
  const elapsedSeconds = Math.floor((Date.now() - callStartedAt) / 1_000);
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  callDuration.textContent = `${minutes}:${seconds}`;
}

function setSwitchState(button: HTMLButtonElement, checked: boolean): void {
  button.setAttribute("aria-checked", String(checked));
}

function setVoiceState(state: VoiceStageState, title: string, hint: string): void {
  voiceStage.dataset.state = state;
  element("voice-state").textContent = title;
  element("voice-hint").textContent = hint;
}

function setText(id: string, value: string, logSource = id): void {
  element(id).textContent = value;
  appendLog(logSource, value);
}

function appendLog(source: string, value: string): void {
  const log = element<HTMLTextAreaElement>("activity-log");
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  log.value += `${log.value.length === 0 ? "" : "\n"}[${time}] ${source}: ${value.replaceAll("\n", " ")}`;
  log.scrollTop = log.scrollHeight;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing #${id}`);
  return found as T;
}
