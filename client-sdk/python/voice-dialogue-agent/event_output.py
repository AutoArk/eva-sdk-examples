from __future__ import annotations

import json


def format_command_event(event: object) -> str | None:
    event_type = getattr(event, "type", "")
    if event_type == "command.called":
        arguments = json.dumps(
            getattr(event, "arguments", {}),
            ensure_ascii=False,
            sort_keys=True,
            default=dict,
        )
        return (
            "command.called: "
            f"{getattr(event, 'command_name', '')} "
            f"call_id={getattr(event, 'call_id', '')} arguments={arguments}"
        )
    if event_type == "command.completed":
        return (
            "command.completed: "
            f"{getattr(event, 'command_name', '')} "
            f"message={getattr(event, 'message', None)!r}"
        )
    if event_type == "command.failed":
        return (
            "command.failed: "
            f"{getattr(event, 'command_name', '')} "
            f"message={getattr(event, 'message', '')!r}"
        )
    return None


def format_turn_latency(event: object) -> str:
    latency = getattr(event, "latency", None)
    stages = getattr(latency, "stages", None)
    measured = (
        ("vad", getattr(stages, "vad_ms", None)),
        ("asr", getattr(stages, "asr_ms", None)),
        ("llm_first", getattr(stages, "llm_first_token_ms", None)),
        ("tts_first", getattr(stages, "tts_first_audio_ms", None)),
        ("playback", getattr(stages, "playback_ms", None)),
        ("total", getattr(latency, "total_ms", None)),
    )
    parts = [f"{name}={value}ms" for name, value in measured if value is not None]
    return "turn.latency" + (f": {' '.join(parts)}" if parts else "")


def show_event(event: object) -> None:
    event_type = getattr(event, "type", "")
    if event_type == "error":
        error = getattr(event, "error", None)
        to_public_dict = getattr(error, "to_public_dict", None)
        details = (
            dict(to_public_dict())
            if callable(to_public_dict)
            else {"source": "sdk", "message": "Unknown SDK error"}
        )
        print(f"error: {json.dumps(details, ensure_ascii=False, sort_keys=True)}", flush=True)
        return
    if event_type == "interruption":
        print(
            "interruption: "
            f"reason={getattr(event, 'reason', '')} "
            f"turn_id={getattr(event, 'turn_id', '')}",
            flush=True,
        )
        return
    if event_type == "image.captured":
        print(
            "image.captured: "
            f"mime={getattr(event, 'mime_type', '')} "
            f"size={getattr(event, 'width', 0)}x{getattr(event, 'height', 0)} "
            f"bytes={getattr(event, 'size_bytes', 0)} "
            f"capture_ms={getattr(event, 'capture_ms', 0)}",
            flush=True,
        )
        return
    command_line = format_command_event(event)
    if command_line is not None:
        print(command_line, flush=True)
        return
    if event_type == "reply.partial":
        print(getattr(event, "text", ""), end="", flush=False)
        return
    if event_type == "turn.latency":
        print(f"\n{format_turn_latency(event)}", flush=True)
        return
    if event_type == "emotion.detected":
        confidence = getattr(event, "confidence", None)
        suffix = (
            f" confidence={confidence:.3f}"
            if isinstance(confidence, (int, float))
            else ""
        )
        print(
            "\nemotion.detected: "
            f"{getattr(event, 'emotion_code', '')} "
            f"source={getattr(event, 'source', '')}{suffix}",
            flush=True,
        )
        return
    if event_type in {
        "speech.started",
        "speech.stopped",
        "transcript.partial",
        "transcript.final",
        "reply.started",
        "reply.final",
        "playback.started",
        "playback.stopped",
    }:
        text = getattr(event, "text", "")
        confidence = getattr(event, "metadata", {}).get("confidence")
        suffix = (
            f" confidence={confidence:.3f}"
            if event_type == "speech.started" and isinstance(confidence, (int, float))
            else ""
        )
        print(f"{event_type}: {text}{suffix}", flush=True)
