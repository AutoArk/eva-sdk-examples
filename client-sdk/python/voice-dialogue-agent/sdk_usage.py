from __future__ import annotations

from argparse import Namespace

from eva_client_sdk import (
    AsrConfig,
    BargeInConfig,
    CameraConfig,
    EmotionConfig,
    EvaVoiceDialogueAgentConfig,
    LlmConfig,
    MediaTransports,
    TtsConfig,
    VadConfig,
    create_eva_voice_dialogue_agent,
)
from eva_client_sdk.contracts import StaticGreeting
from eva_client_sdk.media import OpenCvCameraSource, create_pyaudio_media_transports

from audio_setup import AudioSelection, MeteredInputSource, create_demo_aec
from commands import build_demo_commands
from event_output import show_event
from settings import CAMERA_SYSTEM_PROMPT, GREETING_PROFILES


async def start_eva_agent(*, api_key: str, args: Namespace, audio: AudioSelection):
    """集中展示 Python 语音 demo 的 SDK 接入主路径。"""

    aec = create_demo_aec(
        audio.input_sample_rate,
        tts_sample_rate=args.tts_sample_rate,
    )
    pyaudio = create_pyaudio_media_transports(
        input_sample_rate=audio.input_sample_rate,
        input_device_index=audio.input.index,
        output_device_index=audio.output.index,
        aec=aec,
    )
    transports = MediaTransports(
        input=MeteredInputSource(pyaudio.input),
        output=pyaudio.output,
        aec=pyaudio.aec,
        camera=(
            OpenCvCameraSource(jpeg_quality=70, max_long_edge=640)
            if args.camera
            else None
        ),
    )

    # SDK 接入核心：model、VAD、barge-in、command、Emotion、camera 与 Media SPI。
    agent = create_eva_voice_dialogue_agent(
        EvaVoiceDialogueAgentConfig(
            api_key=api_key,
            asr=AsrConfig(model="ark-asr-plus", sample_rate=16_000),
            llm=LlmConfig(
                model="volcengine-doubao-seed-2.0-mini",
                extra_parameters={"thinking": {"type": "disabled"}},
            ),
            tts=TtsConfig(
                model=args.tts_model,
                voice=args.tts_voice,
                sample_rate=args.tts_sample_rate,
            ),
            vad=VadConfig(sensitivity=0.7, silence_threshold_ms=400),
            barge_in=BargeInConfig(
                initial_playback_guard_ms=args.initial_playback_guard_ms
            ),
            greeting=StaticGreeting(text=GREETING_PROFILES[args.greeting_profile]),
            commands=build_demo_commands(),
            emotion=EmotionConfig(enabled=not args.no_emotion),
            camera=CameraConfig() if args.camera else None,
            system_prompt=CAMERA_SYSTEM_PROMPT,
            transports=transports,
        )
    )

    unsubscribe = agent.on_event(show_event)
    try:
        if args.camera:
            await agent.set_camera_enabled(True)
            print("camera: enabled", flush=True)
        await agent.start()
        return agent, unsubscribe
    except BaseException:
        unsubscribe()
        await agent.stop()
        raise
