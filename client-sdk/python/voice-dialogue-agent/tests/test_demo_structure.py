from __future__ import annotations

import ast
from pathlib import Path

from settings import parse_args

ROOT = Path(__file__).parents[1]


def test_core_sdk_usage_is_short_and_keeps_the_public_facade() -> None:
    source = (ROOT / "sdk_usage.py").read_text(encoding="utf-8")
    assert len(source.splitlines()) < 110
    for expected in (
        "create_eva_voice_dialogue_agent",
        "EvaVoiceDialogueAgentConfig",
        "create_pyaudio_media_transports",
        "NativeAecProcessor",
        "EmotionConfig",
        "CameraConfig",
        "build_demo_commands",
    ):
        combined = source + (ROOT / "audio_setup.py").read_text(encoding="utf-8")
        assert expected in combined


def test_all_demo_modules_compile_and_are_sanitized() -> None:
    for path in ROOT.glob("*.py"):
        source = path.read_text(encoding="utf-8")
        ast.parse(source, filename=str(path))
        assert "/Users/" not in source
        assert "autoark-eva-client-sdk/python" not in source
        assert "sys.path" not in source


def test_cli_preserves_camera_emotion_aec_and_tts_controls() -> None:
    defaults = parse_args([])
    assert defaults.camera is False
    assert defaults.no_emotion is False
    assert defaults.greeting_profile == "short"
    assert defaults.tts_model == "ark-tts-flash"
    assert defaults.tts_voice == "zh_en_male_evan"
    assert defaults.tts_sample_rate == 44_100
    assert parse_args(["--camera", "--no-emotion"]).camera is True
