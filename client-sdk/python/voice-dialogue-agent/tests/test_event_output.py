from __future__ import annotations

from types import MappingProxyType, SimpleNamespace

from event_output import format_command_event, format_turn_latency


def test_command_called_serializes_frozen_arguments() -> None:
    event = SimpleNamespace(
        type="command.called",
        command_name="convert_temperature",
        call_id="call-1",
        arguments=MappingProxyType(
            {"value": 25, "from_unit": "celsius", "to_unit": "fahrenheit"}
        ),
    )
    line = format_command_event(event)
    assert line is not None
    assert line.startswith("command.called: convert_temperature call_id=call-1")
    assert '"from_unit": "celsius"' in line


def test_latency_omits_unavailable_stages() -> None:
    event = SimpleNamespace(
        latency=SimpleNamespace(
            stages=SimpleNamespace(
                vad_ms=None,
                asr_ms=None,
                llm_first_token_ms=0,
                tts_first_audio_ms=640,
                playback_ms=0,
            ),
            total_ms=None,
        )
    )
    assert format_turn_latency(event) == (
        "turn.latency: llm_first=0ms tts_first=640ms playback=0ms"
    )
