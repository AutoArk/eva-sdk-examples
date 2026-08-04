from __future__ import annotations

import argparse
import asyncio
import importlib
import math
import os
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

import numpy as np

from eva_client_sdk import AudioChunk, AudioInputSource, CancellationSignal, MediaError
from eva_client_sdk.media import NativeAecProcessor


class PyAudioInstance(Protocol):
    def get_device_count(self) -> int: ...
    def get_device_info_by_index(self, index: int) -> Mapping[str, object]: ...
    def get_default_input_device_info(self) -> Mapping[str, object]: ...
    def get_default_output_device_info(self) -> Mapping[str, object]: ...
    def get_host_api_info_by_index(self, index: int) -> Mapping[str, object]: ...
    def terminate(self) -> None: ...


class PyAudioModule(Protocol):
    def PyAudio(self) -> PyAudioInstance: ...


@dataclass(frozen=True)
class AudioDevice:
    index: int
    name: str
    host_api_index: int
    host_api_name: str
    max_input_channels: int
    max_output_channels: int
    default_sample_rate: int


@dataclass(frozen=True)
class AudioSelection:
    input: AudioDevice
    output: AudioDevice
    input_sample_rate: int


def _load_pyaudio() -> PyAudioModule:
    try:
        return cast(PyAudioModule, importlib.import_module("pyaudio"))
    except ImportError as error:
        raise RuntimeError(
            "缺少 demo 依赖 PyAudio；请先运行 python3 check_env.py 和 uv sync --frozen。"
        ) from error


def _number(info: Mapping[str, object], key: str) -> float:
    value = info.get(key)
    if not isinstance(value, (int, float)):
        raise RuntimeError(f"音频设备字段无效: {key}")
    return float(value)


def _device_from_info(
    instance: PyAudioInstance,
    info: Mapping[str, object],
) -> AudioDevice:
    index = int(_number(info, "index"))
    host_api_index = int(_number(info, "hostApi"))
    name_value = info.get("name")
    name = str(name_value) if name_value is not None else f"device-{index}"
    try:
        host_info = instance.get_host_api_info_by_index(host_api_index)
        host_name_value = host_info.get("name")
        host_api_name = (
            str(host_name_value)
            if host_name_value is not None
            else f"host-api-{host_api_index}"
        )
    except (IndexError, OSError):
        host_api_name = f"host-api-{host_api_index}"
    return AudioDevice(
        index=index,
        name=name,
        host_api_index=host_api_index,
        host_api_name=host_api_name,
        max_input_channels=int(_number(info, "maxInputChannels")),
        max_output_channels=int(_number(info, "maxOutputChannels")),
        default_sample_rate=round(_number(info, "defaultSampleRate")),
    )


def collect_audio_devices(instance: PyAudioInstance) -> tuple[AudioDevice, ...]:
    devices: list[AudioDevice] = []
    for index in range(instance.get_device_count()):
        try:
            info = instance.get_device_info_by_index(index)
            devices.append(_device_from_info(instance, info))
        except (IndexError, OSError, RuntimeError):
            continue
    return tuple(devices)


def print_audio_devices(instance: PyAudioInstance) -> None:
    devices = collect_audio_devices(instance)
    if not devices:
        print("audio.devices: none", flush=True)
        return
    for device in devices:
        print(
            "audio.device: "
            f"index={device.index} name={device.name!r} "
            f"host_api={device.host_api_name!r} "
            f"input_channels={device.max_input_channels} "
            f"output_channels={device.max_output_channels} "
            f"default_rate={device.default_sample_rate}",
            flush=True,
        )


def _select_device(
    instance: PyAudioInstance,
    *,
    role: str,
    requested_index: int | None,
) -> AudioDevice:
    if role not in {"input", "output"}:
        raise ValueError(f"unsupported audio role: {role}")
    try:
        if requested_index is None:
            info = (
                instance.get_default_input_device_info()
                if role == "input"
                else instance.get_default_output_device_info()
            )
        else:
            if requested_index >= instance.get_device_count():
                raise IndexError(requested_index)
            info = instance.get_device_info_by_index(requested_index)
        device = _device_from_info(instance, info)
    except (IndexError, OSError, RuntimeError) as error:
        selected = "default" if requested_index is None else str(requested_index)
        raise RuntimeError(
            f"audio-{role} device {selected} 不可用；请先运行 --list-devices。"
        ) from error

    channels = device.max_input_channels if role == "input" else device.max_output_channels
    if channels <= 0:
        raise RuntimeError(
            f"audio-{role} device {device.index} 不支持 {role}；请先运行 --list-devices。"
        )
    return device


def resolve_audio_selection(
    instance: PyAudioInstance,
    *,
    input_device_index: int | None,
    output_device_index: int | None,
    input_sample_rate: int | None,
) -> AudioSelection:
    input_device = _select_device(
        instance, role="input", requested_index=input_device_index
    )
    output_device = _select_device(
        instance, role="output", requested_index=output_device_index
    )
    sample_rate = input_sample_rate or input_device.default_sample_rate
    if sample_rate <= 0:
        raise RuntimeError("audio-input sample rate 必须是正整数。")
    return AudioSelection(input_device, output_device, sample_rate)


def inspect_audio(args: argparse.Namespace) -> AudioSelection | None:
    instance = _load_pyaudio().PyAudio()
    try:
        if args.list_devices:
            print_audio_devices(instance)
            return None
        selection = resolve_audio_selection(
            instance,
            input_device_index=args.input_device,
            output_device_index=args.output_device,
            input_sample_rate=args.input_sample_rate,
        )
        print(
            "audio.input: "
            f"name={selection.input.name!r} index={selection.input.index} "
            f"host_api={selection.input.host_api_name!r} rate={selection.input_sample_rate}",
            flush=True,
        )
        print(
            "audio.output: "
            f"name={selection.output.name!r} index={selection.output.index} "
            f"host_api={selection.output.host_api_name!r}",
            flush=True,
        )
        return selection
    finally:
        instance.terminate()


class MeteredInputSource:
    def __init__(self, inner: AudioInputSource) -> None:
        self._inner = inner

    async def start(self) -> None:
        await self._inner.start()

    def frames(
        self, signal: CancellationSignal | None = None
    ) -> AsyncIterator[AudioChunk]:
        return self._frames(signal)

    async def _frames(
        self, signal: CancellationSignal | None
    ) -> AsyncIterator[AudioChunk]:
        loop = asyncio.get_running_loop()
        report_at = loop.time() + 1.0
        sample_count = 0
        squared_sum = 0.0
        peak = 0
        async for chunk in self._inner.frames(signal):
            samples = np.frombuffer(chunk.data, dtype="<i2").astype(np.float64)
            if samples.size:
                sample_count += int(samples.size)
                squared_sum += float(np.dot(samples, samples))
                peak = max(peak, int(np.max(np.abs(samples))))
            now = loop.time()
            if now >= report_at and sample_count:
                rms = math.sqrt(squared_sum / sample_count)
                print(f"mic.level: rms={rms:.1f} peak={peak}", flush=True)
                if peak < 10:
                    print(
                        "mic.warning: 没有收到有效输入；请检查设备 index、route 和系统权限。",
                        flush=True,
                    )
                report_at = now + 1.0
                sample_count = 0
                squared_sum = 0.0
                peak = 0
            yield chunk

    async def stop(self) -> None:
        await self._inner.stop()


def create_demo_aec(
    input_sample_rate: int,
    *,
    tts_sample_rate: int | None = None,
) -> NativeAecProcessor | None:
    configured_library = os.environ.get("EVA_AEC_LIBRARY")
    enabled_value = os.environ.get("EVA_AEC", "1")
    if enabled_value not in {"0", "1"}:
        raise RuntimeError("EVA_AEC 必须是 0 或 1。")
    if enabled_value == "0":
        print("aec: passthrough", flush=True)
        return None
    explicitly_requested = "EVA_AEC" in os.environ or configured_library is not None

    delay_value = os.environ.get("EVA_AEC_DELAY_MS", "60")
    try:
        delay_ms = int(delay_value)
    except ValueError as error:
        raise RuntimeError("EVA_AEC_DELAY_MS 必须是 0 到 500 的整数。") from error
    if not 0 <= delay_ms <= 500:
        raise RuntimeError("EVA_AEC_DELAY_MS 必须是 0 到 500 的整数。")
    for role, sample_rate in (
        ("input", input_sample_rate),
        ("TTS", tts_sample_rate),
    ):
        if sample_rate is not None and (
            not 8_000 <= sample_rate <= 48_000 or sample_rate % 100 != 0
        ):
            raise RuntimeError(
                f"启用 native AEC 时 {role} sample rate 必须位于 8000 到 48000 Hz "
                "并能形成精确 10 ms frame。"
            )

    try:
        aec = NativeAecProcessor(
            library_path=(
                Path(configured_library).expanduser()
                if configured_library is not None
                else None
            ),
            sample_rate=input_sample_rate,
            stream_delay_ms=delay_ms,
        )
    except MediaError as failure:
        if failure.reason != "not_configured":
            raise RuntimeError(
                f"native AEC 创建失败（reason={failure.reason}）。"
            ) from None
        if explicitly_requested:
            raise RuntimeError(
                "找不到 AEC native library；请安装完整 wheel 或检查 EVA_AEC_LIBRARY。"
            ) from None
        print("aec: passthrough", flush=True)
        return None

    print(f"aec: {aec.descriptor.id} delay_ms={delay_ms}", flush=True)
    return aec
