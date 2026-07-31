import {
  createEvaVoiceDialogueAgent,
  type AgentEvent,
  type CommandRegistration,
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

type PageTheme = "light" | "dark";

const demoCommandRegistrations: readonly CommandRegistration[] = [
  {
    definition: {
      name: "show_current_time",
      description: "当用户询问当前时间时，查询当前页面所在设备的本地时间。",
    },
    handler(_call, context) {
      if (context.signal.aborted) {
        return { ok: false, message: "Command cancelled" };
      }
      const now = new Date();
      return {
        ok: true,
        message: `当前本地时间是 ${now.toLocaleTimeString()}`,
        data: {
          isoTime: now.toISOString(),
          localTime: now.toLocaleString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };
    },
  },
  {
    definition: {
      name: "set_page_theme",
      description: "当用户要求切换页面外观时，将当前页面切换为指定的明暗主题。",
      parameters: [{
        name: "theme",
        description: "要应用的页面主题。",
        type: "string",
        required: true,
        enum: ["light", "dark"],
        example: "dark",
      }],
    },
    handler(call, context) {
      if (context.signal.aborted) {
        return { ok: false, message: "Command cancelled" };
      }
      const theme = call.arguments.theme;
      if (theme !== "light" && theme !== "dark") {
        return { ok: false, message: "Unsupported page theme" };
      }
      applyPageTheme(theme);
      return {
        ok: true,
        message: `页面主题已切换为 ${theme}`,
        data: { theme },
      };
    },
  },
];

function applyPageTheme(theme: PageTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

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
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 360 },
      },
      mimeType: "image/jpeg",
      jpegQuality: 0.7,
    }),
  };

  // apiKey 与三个 model 是应用提供的接入配置；其余字段是本 demo 的选择。
  const agent = createEvaVoiceDialogueAgent({
    apiKey: options.apiKey,
    asr: { model: "ark-asr-plus", sampleRate: 16_000 },
    llm: { model: "doubao-seed-2-0-mini-nothink" },
    tts: {
      model: "ark-tts-flash",
      voice: "zh_en_male_evan",
      sampleRate: 44100,
    },
    vad: {
      sensitivity: 0.7,
      silenceThresholdMs: 400,
    },
    transports,
    // AEC 初始化采集阶段的回声消除效果尚未稳定，因此为首段 playback 保留 3 秒保护窗口。
    bargeIn: {
      initialPlaybackGuardMs: 3000,
    },
    history: { maxTurns: 10 },
    camera: { captureTimeoutMs: 1500 },
    // 可选：省略 emotion（或设为 enabled: false）时不运行旁路分类，也不产生 emotion.detected。
    // custom labels 会替换默认业务标签；SDK 会自动补充 unknown。
    emotion: { enabled: true, labels: ["happy", "sad"] },
    // 可选：省略 commands（或提供空 registrations）时不向 LLM 暴露 command。
    commands: {
      registrations: demoCommandRegistrations,
      maxCallsPerTurn: 3,
    },
    systemPrompt: [
      "你是一个简洁、自然的语音助手。",
      "只有当前用户消息实际包含图片时，才可以描述当前看到的画面。",
      "当前用户消息没有图片时，不得把历史中的视觉描述说成实时观察；",
      "如需引用，只能明确说明那是之前看到的内容，并说明当前没有新的画面。",
    ].join(""),
    greeting: {
      mode: "static",
      text: [
        "你好，很高兴见到你！我是 EVA 语音助手，接下来你可以和我随便聊聊天，",
        "也可以问我现在的时间、让我切换页面主题，或者打开摄像头后问我看到了什么。",
        "我会认真听你说话，并尽量用简洁自然的方式回答。",
        "准备好以后，直接对我说话就可以了。",
      ].join(""),
    },
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
