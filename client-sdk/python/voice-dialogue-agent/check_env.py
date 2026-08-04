from __future__ import annotations

import ctypes.util
import os
import platform
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

MINIMUM_PYTHON = (3, 11)
MACOS_REPAIR = (
    "uv python install 3.11",
    "xcode-select --install",
    "brew install portaudio",
)
DEBIAN_REPAIR = (
    "uv python install 3.11",
    "sudo apt-get update",
    "sudo apt-get install -y build-essential libportaudio2 portaudio19-dev",
)


@dataclass(frozen=True)
class EnvironmentProbe:
    system: str
    python_version: tuple[int, int, int]
    compiler: str | None
    portaudio_header: str | None
    portaudio_library: str | None


def _first_existing(paths: list[Path]) -> str | None:
    return next((str(path) for path in paths if path.is_file()), None)


def _compiler() -> str | None:
    configured = os.environ.get("CC")
    candidates = [configured] if configured else []
    candidates.extend(["cc", "clang", "gcc"])
    return next((path for name in candidates if name and (path := shutil.which(name))), None)


def _portaudio_header(system: str) -> str | None:
    candidates = [
        Path("/usr/include/portaudio.h"),
        Path("/usr/local/include/portaudio.h"),
        Path("/opt/homebrew/include/portaudio.h"),
        Path("/opt/local/include/portaudio.h"),
    ]
    if system == "Darwin":
        homebrew = shutil.which("brew")
        if homebrew:
            import subprocess

            result = subprocess.run(
                [homebrew, "--prefix", "portaudio"],
                capture_output=True,
                check=False,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                candidates.insert(0, Path(result.stdout.strip()) / "include" / "portaudio.h")
    return _first_existing(candidates)


def _portaudio_library() -> str | None:
    discovered = ctypes.util.find_library("portaudio")
    if discovered:
        return discovered
    return _first_existing(
        [
            Path("/opt/homebrew/lib/libportaudio.dylib"),
            Path("/usr/local/lib/libportaudio.dylib"),
            Path("/usr/lib/x86_64-linux-gnu/libportaudio.so.2"),
            Path("/usr/lib/aarch64-linux-gnu/libportaudio.so.2"),
        ]
    )


def probe_environment() -> EnvironmentProbe:
    return EnvironmentProbe(
        system=platform.system(),
        python_version=(sys.version_info.major, sys.version_info.minor, sys.version_info.micro),
        compiler=_compiler(),
        portaudio_header=_portaudio_header(platform.system()),
        portaudio_library=_portaudio_library(),
    )


def failures(probe: EnvironmentProbe) -> tuple[str, ...]:
    problems: list[str] = []
    if probe.python_version[:2] < MINIMUM_PYTHON:
        problems.append("Python 版本低于 3.11")
    if probe.compiler is None:
        problems.append("未找到 C compiler")
    if probe.portaudio_header is None:
        problems.append("未找到 portaudio.h")
    if probe.portaudio_library is None:
        problems.append("未找到 PortAudio runtime library")
    return tuple(problems)


def repair_commands(system: str) -> tuple[str, ...]:
    if system == "Darwin":
        return MACOS_REPAIR
    if system == "Linux":
        return DEBIAN_REPAIR
    return ()


def main() -> int:
    probe = probe_environment()
    print(
        "environment: "
        f"os={probe.system} "
        f"python={'.'.join(map(str, probe.python_version))} "
        f"compiler={probe.compiler or 'missing'}"
    )
    print(f"portaudio.header: {probe.portaudio_header or 'missing'}")
    print(f"portaudio.library: {probe.portaudio_library or 'missing'}")
    problems = failures(probe)
    if not problems:
        print("PASS: Python、C compiler 与 PortAudio preflight 通过。")
        return 0

    print("FAIL: " + "；".join(problems))
    commands = repair_commands(probe.system)
    if commands:
        print("修复后重新运行 python3 check_env.py：")
        for command in commands:
            print(command)
    else:
        print("请安装 Python 3.11+、C compiler、PortAudio runtime 与开发头文件。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
