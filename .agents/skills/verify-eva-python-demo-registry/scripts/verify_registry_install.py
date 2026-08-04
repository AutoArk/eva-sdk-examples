#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
import sys
import tempfile
import urllib.request
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEMO_ROOT = REPOSITORY_ROOT / "client-sdk/python/voice-dialogue-agent"
RELEASE_PATH = DEMO_ROOT / "registry-release.json"


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_release() -> dict[str, Any]:
    release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
    if release.get("schemaVersion") != 1:
        fail("registry-release.json schemaVersion must be 1")
    return release


def select_expected_wheel(
    release: Mapping[str, Any], system: str, machine: str
) -> Mapping[str, Any]:
    normalized_machine = machine.lower()
    if normalized_machine in {"amd64", "x64"}:
        normalized_machine = "x86_64"
    if normalized_machine == "arm64" and system == "Linux":
        normalized_machine = "aarch64"
    selected = [
        wheel
        for wheel in release.get("wheels", [])
        if wheel.get("system") == system and wheel.get("machine") == normalized_machine
    ]
    if len(selected) != 1:
        fail(f"expected one wheel for {system}/{normalized_machine}, found {len(selected)}")
    return selected[0]


def validate_remote_release(
    release: Mapping[str, Any], payload: Mapping[str, Any]
) -> dict[str, str]:
    info = payload.get("info")
    if not isinstance(info, Mapping) or info.get("version") != release.get("version"):
        fail("registry metadata version drifted")
    expected = {
        str(wheel["filename"]): str(wheel["sha256"])
        for wheel in release.get("wheels", [])
    }
    actual: dict[str, str] = {}
    for item in payload.get("urls", []):
        if item.get("packagetype") != "bdist_wheel":
            fail(f"unexpected non-wheel registry artifact: {item.get('filename')}")
        filename = str(item.get("filename"))
        digest = str(item.get("digests", {}).get("sha256"))
        actual[filename] = digest
    if actual != expected:
        fail(f"registry wheel set/SHA drifted: expected={expected}, actual={actual}")
    return {
        str(item["filename"]): str(item["url"])
        for item in payload.get("urls", [])
    }


def fetch_json(url: str) -> Mapping[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "eva-sdk-examples-verifier/1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def download_and_hash(url: str, destination: Path) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "eva-sdk-examples-verifier/1"})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as stream:
        while chunk := response.read(1024 * 1024):
            stream.write(chunk)
    return sha256(destination)


def inspect_installed(release: Mapping[str, Any], wheel: Mapping[str, Any]) -> dict[str, Any]:
    package = str(release["package"])
    version = str(release["version"])
    distribution = importlib.metadata.distribution(package)
    if distribution.version != version:
        fail(f"installed distribution is {distribution.version}, expected {version}")
    expected_prefix = (DEMO_ROOT / ".venv").resolve()
    if Path(sys.prefix).resolve() != expected_prefix:
        fail(f"verifier is not running from the demo .venv: {sys.prefix}")

    package_root = Path(distribution.locate_file("eva_client_sdk")).resolve()
    if not package_root.is_relative_to(expected_prefix):
        fail(f"eva_client_sdk was not imported from the demo .venv: {package_root}")
    direct_urls = [item for item in distribution.files or [] if item.name == "direct_url.json"]
    if direct_urls:
        fail("installed SDK contains direct_url.json; local/path installation is forbidden")

    native_path = package_root / "_native" / str(wheel["nativeLibrary"])
    if not native_path.is_file():
        fail(f"installed native AEC library is missing: {native_path.name}")
    native_digest = sha256(native_path)
    if native_digest != wheel["nativeSha256"]:
        fail(
            f"installed native AEC SHA drifted: expected {wheel['nativeSha256']}, got {native_digest}"
        )

    import eva_client_sdk
    from eva_client_sdk.media import NativeAecProcessor

    if eva_client_sdk.__version__ != version:
        fail(f"imported version is {eva_client_sdk.__version__}, expected {version}")
    processor = NativeAecProcessor(sample_rate=48_000)
    try:
        descriptor = processor.descriptor
        metadata = dict(descriptor.metadata)
    finally:
        processor.release()
    expected_identity = release["nativeAec"]
    if descriptor.id != expected_identity["descriptorId"]:
        fail(f"native AEC descriptor drifted: {descriptor.id}")
    if metadata.get("abi") != expected_identity["abi"]:
        fail(f"native AEC ABI drifted: {metadata.get('abi')}")
    if not isinstance(metadata.get("native_version"), str) or not metadata["native_version"]:
        fail("native AEC version is missing")

    return {
        "distributionVersion": distribution.version,
        "importedVersion": eva_client_sdk.__version__,
        "packageRoot": str(package_root),
        "nativeLibrary": native_path.name,
        "nativeSha256": native_digest,
        "nativeDescriptor": descriptor.id,
        "nativeMetadata": metadata,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.report.exists():
        fail(f"refusing to overwrite report: {args.report}")
    release = read_release()
    wheel = select_expected_wheel(release, platform.system(), platform.machine())
    package = release["package"]
    version = release["version"]
    registry_url = f"https://test.pypi.org/pypi/{package}/{version}/json"
    remote_payload = fetch_json(registry_url)
    urls = validate_remote_release(release, remote_payload)
    with tempfile.TemporaryDirectory(prefix="eva-python-registry-") as directory:
        snapshot = Path(directory) / str(wheel["filename"])
        remote_digest = download_and_hash(urls[str(wheel["filename"])], snapshot)
    if remote_digest != wheel["sha256"]:
        fail(f"downloaded wheel SHA drifted: expected {wheel['sha256']}, got {remote_digest}")

    report = {
        "schemaVersion": 1,
        "status": "PASS",
        "registry": release["registry"],
        "package": package,
        "version": version,
        "wheel": wheel["filename"],
        "wheelSha256": remote_digest,
        "installed": inspect_installed(release, wheel),
        "automatedChecks": {
            "registryIdentity": "PASS",
            "installedIdentity": "PASS",
            "nativeAecIdentity": "PASS",
        },
        "manualRegression": {
            "status": "NOT_RUN",
            "boundaries": [
                "Gateway text/voice turn",
                "Emotion event",
                "TTS playback",
                "open-speaker microphone AEC effect",
                "camera image turn and resource release",
            ],
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        raise SystemExit(f"registry verification failed: {error}") from None
