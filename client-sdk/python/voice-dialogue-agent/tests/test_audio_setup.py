from __future__ import annotations

from collections.abc import Mapping

import pytest

import audio_setup
from audio_setup import create_demo_aec, resolve_audio_selection


class FakePyAudio:
    def __init__(self) -> None:
        self.devices = [
            {
                "index": 0,
                "name": "USB microphone",
                "hostApi": 0,
                "maxInputChannels": 1,
                "maxOutputChannels": 0,
                "defaultSampleRate": 44_100.0,
            },
            {
                "index": 1,
                "name": "USB speaker",
                "hostApi": 0,
                "maxInputChannels": 0,
                "maxOutputChannels": 2,
                "defaultSampleRate": 48_000.0,
            },
        ]

    def get_device_count(self) -> int:
        return len(self.devices)

    def get_device_info_by_index(self, index: int) -> Mapping[str, object]:
        if index < 0 or index >= len(self.devices):
            raise IndexError(index)
        return self.devices[index]

    def get_default_input_device_info(self) -> Mapping[str, object]:
        return self.devices[0]

    def get_default_output_device_info(self) -> Mapping[str, object]:
        return self.devices[1]

    def get_host_api_info_by_index(self, index: int) -> Mapping[str, object]:
        assert index == 0
        return {"name": "PortAudio test host"}

    def terminate(self) -> None:
        pass


def test_default_devices_keep_native_input_rate() -> None:
    selection = resolve_audio_selection(
        FakePyAudio(),
        input_device_index=None,
        output_device_index=None,
        input_sample_rate=None,
    )
    assert selection.input.index == 0
    assert selection.output.index == 1
    assert selection.input_sample_rate == 44_100


@pytest.mark.parametrize(
    ("input_index", "output_index", "message"),
    [
        (1, 1, "audio-input device 1 不支持 input"),
        (0, 0, "audio-output device 0 不支持 output"),
        (99, 1, "audio-input device 99 不可用"),
    ],
)
def test_rejects_wrong_role_or_unknown_device(
    input_index: int, output_index: int, message: str
) -> None:
    with pytest.raises(RuntimeError, match=message):
        resolve_audio_selection(
            FakePyAudio(),
            input_device_index=input_index,
            output_device_index=output_index,
            input_sample_rate=None,
        )


class AecRecorder:
    descriptor = type("Descriptor", (), {"id": "eva-webrtc-aec3"})()

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def factory(self, **kwargs: object) -> AecRecorder:
        self.calls.append(dict(kwargs))
        return self


def test_aec_defaults_to_packaged_library_and_60_ms_delay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for variable in ("EVA_AEC", "EVA_AEC_LIBRARY", "EVA_AEC_DELAY_MS"):
        monkeypatch.delenv(variable, raising=False)
    recorder = AecRecorder()
    monkeypatch.setattr(audio_setup, "NativeAecProcessor", recorder.factory)

    assert create_demo_aec(48_000, tts_sample_rate=44_100) is recorder
    assert recorder.calls == [
        {"library_path": None, "sample_rate": 48_000, "stream_delay_ms": 60}
    ]


def test_aec_can_be_explicitly_disabled_without_loading_native(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = AecRecorder()
    monkeypatch.setattr(audio_setup, "NativeAecProcessor", recorder.factory)
    monkeypatch.setenv("EVA_AEC", "0")

    assert create_demo_aec(48_000) is None
    assert recorder.calls == []


@pytest.mark.parametrize("sample_rate", [7_900, 11_025, 22_050, 48_100])
def test_aec_rejects_rates_without_exact_ten_ms_frames(
    monkeypatch: pytest.MonkeyPatch, sample_rate: int
) -> None:
    monkeypatch.delenv("EVA_AEC", raising=False)
    monkeypatch.delenv("EVA_AEC_LIBRARY", raising=False)
    with pytest.raises(RuntimeError, match="精确 10 ms frame"):
        create_demo_aec(sample_rate)
