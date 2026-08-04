#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import re
import sys
import tomllib
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    raise RuntimeError(message)


def local_source_present(value: object) -> bool:
    if isinstance(value, dict):
        if set(value) & {"path", "editable", "workspace", "git"}:
            return True
        return any(local_source_present(item) for item in value.values())
    if isinstance(value, list):
        return any(local_source_present(item) for item in value)
    return isinstance(value, str) and (
        value.startswith(("file:", "file://", "../", "./")) or "/Users/" in value
    )


def main() -> int:
    if len(sys.argv) != 3:
        fail("usage: inspect-python-demo.py <directory> <sdk-package>")
    directory = Path(sys.argv[1]).resolve()
    package_name = sys.argv[2]
    pyproject_path = directory / "pyproject.toml"
    lock_path = directory / "uv.lock"
    release_path = directory / "registry-release.json"
    pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    release = json.loads(release_path.read_text(encoding="utf-8"))

    dependencies = pyproject.get("project", {}).get("dependencies", [])
    matches = [
        re.fullmatch(
            rf"{re.escape(package_name)}\[([^]]+)\]==([0-9A-Za-z.!+-]+)",
            dependency,
        )
        for dependency in dependencies
        if isinstance(dependency, str)
    ]
    matches = [match for match in matches if match is not None]
    if len(matches) != 1:
        fail(f"{package_name}: exact SDK dependency with extras is required")
    extras = set(matches[0].group(1).split(","))
    version = matches[0].group(2)
    if extras != {"pyaudio", "camera"}:
        fail(f"{package_name}: SDK extras must be exactly pyaudio,camera")

    sources = pyproject.get("tool", {}).get("uv", {}).get("sources", {})
    source = sources.get(package_name)
    if source != {"index": "eva-testpypi"}:
        fail(f"{package_name}: SDK must use only the eva-testpypi named source")
    indexes = pyproject.get("tool", {}).get("uv", {}).get("index", [])
    matching_indexes = [index for index in indexes if index.get("name") == "eva-testpypi"]
    if matching_indexes != [
        {
            "name": "eva-testpypi",
            "url": "https://test.pypi.org/simple",
            "explicit": True,
        }
    ]:
        fail("eva-testpypi must be an explicit named TestPyPI index")
    if local_source_present(pyproject):
        fail("pyproject.toml contains a forbidden local/workspace/git source")

    packages = [item for item in lock.get("package", []) if item.get("name") == package_name]
    if len(packages) != 1:
        fail(f"uv.lock must contain exactly one {package_name} package")
    locked = packages[0]
    if locked.get("version") != version:
        fail(f"uv.lock SDK version drifted: {locked.get('version')} != {version}")
    registry = str(locked.get("source", {}).get("registry", "")).rstrip("/")
    if registry != "https://test.pypi.org/simple":
        fail(f"uv.lock SDK registry drifted: {registry}")
    for item in lock.get("package", []):
        if item.get("name") in {package_name, pyproject["project"]["name"]}:
            continue
        third_party_registry = str(item.get("source", {}).get("registry", "")).rstrip("/")
        if third_party_registry != "https://pypi.org/simple":
            fail(
                f"third-party package {item.get('name')} must resolve from PyPI, "
                f"got {third_party_registry or 'no registry'}"
            )
    lock_text = lock_path.read_text(encoding="utf-8")
    if local_source_present(lock) or re.search(r"(?:file://|workspace|editable|/Users/)", lock_text):
        fail("uv.lock contains a forbidden local source")

    expected_wheels = {
        wheel["filename"]: wheel["sha256"] for wheel in release.get("wheels", [])
    }
    locked_wheels = {
        str(item["url"]).rsplit("/", 1)[-1]: str(item["hash"]).removeprefix("sha256:")
        for item in locked.get("wheels", [])
    }
    if locked_wheels != expected_wheels:
        fail("uv.lock wheel filename/SHA set drifted from registry-release.json")
    if (
        release.get("package") != package_name
        or release.get("version") != version
        or str(release.get("indexUrl", "")).rstrip("/") != registry
    ):
        fail("registry-release.json package/version/index drifted from project identity")

    public_imports: set[str] = set()
    for path in directory.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                public_imports.update(alias.name for alias in node.names if alias.name.startswith("eva_client_sdk"))
            elif isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("eva_client_sdk"):
                public_imports.add(node.module)
    if not public_imports or not all(
        item == "eva_client_sdk" or item.startswith("eva_client_sdk.")
        for item in public_imports
    ):
        fail("demo must consume only public eva_client_sdk imports")

    print(
        json.dumps(
            {
                "package": package_name,
                "version": version,
                "registry": "testpypi",
                "publicImports": sorted(public_imports),
                "wheelCount": len(locked_wheels),
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, tomllib.TOMLDecodeError) as error:
        raise SystemExit(f"python demo inspection failed: {error}") from None
