from __future__ import annotations

import check_env


def test_complete_environment_passes() -> None:
    probe = check_env.EnvironmentProbe(
        system="Darwin",
        python_version=(3, 11, 0),
        compiler="/usr/bin/clang",
        portaudio_header="/opt/homebrew/include/portaudio.h",
        portaudio_library="/opt/homebrew/lib/libportaudio.dylib",
    )
    assert check_env.failures(probe) == ()


def test_each_missing_requirement_is_reported() -> None:
    probe = check_env.EnvironmentProbe(
        system="Linux",
        python_version=(3, 10, 14),
        compiler=None,
        portaudio_header=None,
        portaudio_library=None,
    )
    assert check_env.failures(probe) == (
        "Python 版本低于 3.11",
        "未找到 C compiler",
        "未找到 portaudio.h",
        "未找到 PortAudio runtime library",
    )


def test_repair_commands_are_copyable_for_supported_platforms() -> None:
    assert check_env.repair_commands("Darwin") == (
        "uv python install 3.11",
        "xcode-select --install",
        "brew install portaudio",
    )
    assert check_env.repair_commands("Linux") == (
        "uv python install 3.11",
        "sudo apt-get update",
        "sudo apt-get install -y build-essential libportaudio2 portaudio19-dev",
    )
