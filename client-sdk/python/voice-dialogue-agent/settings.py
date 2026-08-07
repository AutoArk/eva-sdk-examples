from __future__ import annotations

import argparse
from collections.abc import Sequence

CAMERA_SYSTEM_PROMPT = "".join(
    (
        "你是 EVA，一个简洁、自然、可靠的语音与文字对话助手。",
        "用户的语音会先由系统转写成当前消息再交给你；不要说自己听不到用户，也不要否认正在进行语音对话。",
        "当用户询问你是否听到时，说明你能处理已经送达的语音转写；不要声称能直接感知尚未发送的声音。",
        "只有当前用户消息实际包含图片时，才可以描述当前看到的画面。",
        "摄像头开启且当前用户消息带有图片时，这张图片就是你此刻看到的画面；应基于它回答，不要把它当成历史图片，也不要否认你收到了视觉输入。",
        "当用户询问你能看到什么但当前消息没有图片时，明确说明当前没有收到新的图片或摄像头画面；不要声称看到了现实画面，也不要笼统说自己完全不能看图。",
        "当前用户消息没有图片时，不得把历史中的视觉描述说成实时观察；如需引用，只能明确说明那是之前看到的内容，并说明当前没有新的画面。",
    )
)
GREETING_PROFILES = {
    "short": (
        "你好，很高兴见到你！我是 EVA 语音助手，接下来你可以和我随便聊聊天，"
        "也可以问我现在的时间、让我切换页面主题，或者打开摄像头后问我看到了什么。"
        "我会认真听你说话，并尽量用简洁自然的方式回答。"
        "准备好以后，直接对我说话就可以了。"
    ),
    "long": (
        "你好，欢迎使用 EVA 语音助手。接下来我会用一段稍长的开场白介绍当前演示："
        "麦克风会持续采集声音，端侧语音检测会判断用户何时开始说话，"
        "系统也会通过回声消除处理扬声器播放的声音。"
        "请在这段开场白播放期间保持安静，等我完整说完以后再开始交流。"
    ),
}
DEFAULT_TTS_MODEL = "ark-tts-flash"
DEFAULT_TTS_VOICE = "zh_en_male_evan"
DEFAULT_TTS_SAMPLE_RATE = 44_100


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("必须是正整数")
    return parsed


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("必须是非负整数")
    return parsed


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="EVA Python 终端语音对话 demo")
    parser.add_argument(
        "--list-devices",
        action="store_true",
        help="列出 PortAudio host API 和输入输出设备后退出",
    )
    parser.add_argument(
        "--input-device",
        type=_non_negative_int,
        help="输入设备 index；省略时使用 PortAudio 默认输入 route",
    )
    parser.add_argument(
        "--output-device",
        type=_non_negative_int,
        help="输出设备 index；省略时使用 PortAudio 默认输出 route",
    )
    parser.add_argument(
        "--input-sample-rate",
        type=_positive_int,
        help="采集采样率；省略时使用输入设备 defaultSampleRate",
    )
    parser.add_argument(
        "--tts-model",
        default=DEFAULT_TTS_MODEL,
        help=f"TTS model；默认 {DEFAULT_TTS_MODEL}",
    )
    parser.add_argument(
        "--tts-voice",
        default=DEFAULT_TTS_VOICE,
        help=f"TTS voice；默认 {DEFAULT_TTS_VOICE}",
    )
    parser.add_argument(
        "--tts-sample-rate",
        type=_positive_int,
        default=DEFAULT_TTS_SAMPLE_RATE,
        help=f"TTS PCM 采样率；默认 {DEFAULT_TTS_SAMPLE_RATE}",
    )
    parser.add_argument(
        "--greeting-profile",
        choices=tuple(GREETING_PROFILES),
        default="short",
        help="开场白 profile；默认 short",
    )
    parser.add_argument(
        "--initial-playback-guard-ms",
        type=_non_negative_int,
        default=3000,
        help="首次 playback 的语音 admission 保护窗口（毫秒）；默认 3000",
    )
    parser.add_argument(
        "--no-emotion",
        action="store_true",
        help="关闭 emotion 旁路分类；默认开启",
    )
    parser.add_argument(
        "--camera",
        action="store_true",
        help="启用 camera snapshot，让当前 LLM 回答画面问题",
    )
    return parser.parse_args(argv)
