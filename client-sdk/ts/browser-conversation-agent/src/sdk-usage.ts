import {
  createEvaVoiceDialogueAgent,
  type AgentEvent,
  type EvaVoiceDialogueAgent,
} from "@autoark-ai/eva-client-sdk-ts";
import type { MediaTransportsConfig } from "@autoark-ai/eva-client-sdk-ts/spi";
import {
  createBrowserAudioInputSource,
  createBrowserAudioOutputSink,
  createBrowserCameraSnapshotSource,
  createPassthroughAecProcessor,
} from "@autoark-ai/eva-client-sdk-ts/browser";

export type { AgentEvent, EvaVoiceDialogueAgent };

type StartEvaAgentOptions = {
  apiKey: string;
  audioInputEnabled: boolean;
  ttsEnabled: boolean;
  cameraEnabled: boolean;
  onEvent: (event: AgentEvent, source: EvaVoiceDialogueAgent) => void;
};

type StartedEvaAgent = {
  agent: EvaVoiceDialogueAgent;
  unsubscribe: () => void;
};

/**
 * SDK 接入主路径（浏览器语音 demo）。
 *
 * 页面弹窗、按钮状态、日志和消息渲染都留在 main.ts；这里连续展示：
 * 1. 组合 Media SPI；2. 创建 Agent；3. 订阅事件；4. 配置初始状态并启动。
 */
export async function startEvaAgent(options: StartEvaAgentOptions): Promise<StartedEvaAgent> {
  // 语音接入需要完整的 input / output / AEC；纯文本接入可以省略 transports 与 vad。
  const transports: MediaTransportsConfig = {
    input: createBrowserAudioInputSource({
      maxBufferedChunks: 64,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }),
    output: createBrowserAudioOutputSink(),
    aec: createPassthroughAecProcessor(),
    // 默认 browser camera helper 是可替换的 CameraSnapshotSource；factory 不会自行申请权限。
    camera: createBrowserCameraSnapshotSource({
      video: { facingMode: { ideal: "user" } },
      mimeType: "image/png",
    }),
  };

  // apiKey 与三个 model 是应用提供的接入配置；其余字段是本 demo 的选择。
  const agent = createEvaVoiceDialogueAgent({
    apiKey: options.apiKey,
    asr: { model: "fun_asr", sampleRate: 48_000 },
    llm: { model: "doubao-seed-2-0-mini-nothink" },
    tts: {
      model: "cosyvoice_tts",
      voice: "longjielidou_v3",
      sampleRate: 48_000,
    },
    vad: {
      sensitivity: 0.7,
      silenceThresholdMs: 400,
    },
    transports,
    history: { maxTurns: 10 },
    camera: { captureTimeoutMs: 1500 },
    systemPrompt: [
      "你是一个简洁、自然的语音助手。",
      "只有当前用户消息实际包含图片时，才可以描述当前看到的画面。",
      "当前用户消息没有图片时，不得把历史中的视觉描述说成实时观察；",
      "如需引用，只能明确说明那是之前看到的内容，并说明当前没有新的画面。",
    ].join(""),
    greeting: { mode: "static", text: "你好啊" },
  });

  const unsubscribe = agent.onEvent((event) => options.onEvent(event, agent));
  try {
    await agent.setAudioInputEnabled(options.audioInputEnabled);
    await agent.setCameraCaptureEnabled(options.cameraEnabled);
    await agent.setTtsEnabled(options.ttsEnabled);
    await agent.start();
    return { agent, unsubscribe };
  } catch (error) {
    unsubscribe();
    throw error;
  }
}
