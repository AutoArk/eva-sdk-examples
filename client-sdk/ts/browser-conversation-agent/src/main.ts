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
      return;
    }
    setMediaControlsLocked(true);
    setText("status", "启动中…");
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
    setText("status", "运行中");
    setText("microphone", audioInputEnabled ? "已连接" : "已禁用");
    setText("camera-status", cameraEnabled ? "持续连接；说话时采一张图" : "默认关闭");
    stopButton.disabled = false;
    submitButton.disabled = false;
    setMediaControlsLocked(false);
  } catch (error) {
    setText("status", "启动失败");
    setText("microphone", "不可用");
    setText("error", error instanceof Error ? error.message : String(error));
    unsubscribe?.();
    unsubscribe = undefined;
    agent = undefined;
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
  setMediaControlsLocked(true);
  setText("status", "停止中…");
  try {
    await current.stop();
    renderMessages(current);
    setText("status", "已停止；再次启动会创建新会话");
    setText("microphone", "已释放");
    setText("camera-status", "已释放");
  } catch (error) {
    setText("error", error instanceof Error ? error.message : String(error));
  } finally {
    unsubscribe?.();
    unsubscribe = undefined;
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
    audioInputButton.textContent = `麦克风：${audioInputEnabled ? "开启" : "关闭"}`;
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
    ttsButton.textContent = `TTS：${ttsEnabled ? "开启" : "关闭"}`;
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
    cameraButton.textContent = `摄像头：${cameraEnabled ? "开启" : "关闭"}`;
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

// SDK event → Demo 页面投影；switch 同时展示 AgentEvent 的穷尽消费方式。
function handleEvent(event: AgentEvent, sourceAgent: EvaVoiceDialogueAgent): void {
  switch (event.type) {
    case "speech.started":
      setText("microphone", "检测到说话");
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
      return;
    case "transcript.partial":
      setText("transcript", event.text, event.type);
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
      return;
    case "reply.partial":
      element("reply").textContent += event.text;
      return;
    case "reply.final":
      setText("reply", event.text, event.type);
      renderMessages(sourceAgent);
      return;
    case "playback.started":
      setText("status", "播放回复");
      return;
    case "playback.stopped":
      setText("status", "运行中");
      return;
    case "turn.latency":
      setText("latency", JSON.stringify(event.latency, null, 2));
      return;
    case "error":
      if (event.error.source === "media" && event.error.role === "camera") {
        if (event.error.operation === "start") {
          cameraEnabled = false;
          cameraButton.textContent = "摄像头：关闭";
          setText("camera-status", "不可用或未授权");
        }
      }
      setText("error", JSON.stringify(event.error, null, 2));
      return;
    default:
      event satisfies never;
      return;
  }
}

// Demo-only 渲染与日志 helper。
function renderMessages(source: EvaVoiceDialogueAgent): void {
  const list = element<HTMLOListElement>("messages");
  list.replaceChildren(...source.getMessages().map((message) => {
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
