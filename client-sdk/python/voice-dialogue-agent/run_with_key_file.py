from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

KEY_MAPPINGS = {"EVA_GATEWAY_API_KEY": "EVA_GATEWAY_API_KEY"}


def parse_key_file(contents: str) -> dict[str, str]:
    expected = set(KEY_MAPPINGS)
    values: dict[str, list[str]] = {name: [] for name in expected}
    for raw_line in contents.removeprefix("\ufeff").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").strip()
        name, separator, raw_value = line.partition("=")
        name = name.strip()
        if not separator or name not in expected:
            continue
        value = raw_value.strip()
        if value[:1] in {"'", '"'}:
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"{name} 引号不匹配")
            value = value[1:-1]
        elif value[-1:] in {"'", '"'}:
            raise ValueError(f"{name} 引号不匹配")
        if not value or any(character.isspace() for character in value):
            raise ValueError(f"{name} 必须是非空且不含空白的值")
        values[name].append(value)

    result: dict[str, str] = {}
    for name in expected:
        if not values[name]:
            raise ValueError(f"key 文件缺少 {name}")
        if len(values[name]) != 1:
            raise ValueError(f"key 文件包含重复的 {name}")
        result[name] = values[name][0]
    return result


def create_runtime_environment(
    values: Mapping[str, str],
    base: Mapping[str, str] = os.environ,
) -> dict[str, str]:
    environment = dict(base)
    for source, target in KEY_MAPPINGS.items():
        environment.pop(source, None)
        environment[target] = values[source]
    return environment


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if not arguments:
        raise ValueError(
            "用法: uv run python run_with_key_file.py /path/to/key-file [-- demo 参数]"
        )
    key_file = Path(arguments.pop(0)).expanduser()
    if arguments[:1] == ["--"]:
        arguments.pop(0)
    values = parse_key_file(key_file.read_text(encoding="utf-8"))
    command = [sys.executable, str(Path(__file__).with_name("main.py")), *arguments]
    print(f"从 key 文件映射 {len(values)} 个变量并启动 demo（值已隐藏）。", flush=True)
    return subprocess.run(
        command,
        cwd=Path(__file__).parent,
        env=create_runtime_environment(values),
        check=False,
    ).returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        raise SystemExit(f"key-file launch failed: {error}") from None
