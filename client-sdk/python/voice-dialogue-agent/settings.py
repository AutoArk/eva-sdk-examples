from __future__ import annotations

import argparse
from collections.abc import Sequence

CAMERA_SYSTEM_PROMPT = "请基于当前用户文本与当前图片回答；不要猜测图片之外的信息。"
GREETING_PROFILES = {
    "short": "你好",
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
        default=0,
        help="首次 playback 的语音 admission 保护窗口（毫秒）；默认 0",
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
