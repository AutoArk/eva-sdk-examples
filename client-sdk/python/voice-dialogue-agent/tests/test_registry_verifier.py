from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).parents[4]
    / ".agents/skills/verify-eva-python-demo-registry/scripts/verify_registry_install.py"
)
if not SCRIPT.is_file():
    pytest.skip(
        f"Optional agent skill verifier script not present: {SCRIPT}",
        allow_module_level=True,
    )

SPEC = importlib.util.spec_from_file_location("verify_registry_install", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
verifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)


def release() -> dict[str, object]:
    return {
        "version": "1.0.0",
        "wheels": [
            {
                "filename": "mac.whl",
                "sha256": "a" * 64,
                "system": "Darwin",
                "machine": "arm64",
            },
            {
                "filename": "linux.whl",
                "sha256": "b" * 64,
                "system": "Linux",
                "machine": "x86_64",
            },
        ],
    }


def test_selects_exact_host_wheel() -> None:
    assert verifier.select_expected_wheel(release(), "Darwin", "arm64")["filename"] == "mac.whl"
    assert verifier.select_expected_wheel(release(), "Linux", "amd64")["filename"] == "linux.whl"


def test_rejects_unsupported_or_ambiguous_host() -> None:
    with pytest.raises(RuntimeError, match="expected one wheel"):
        verifier.select_expected_wheel(release(), "Windows", "amd64")


def test_registry_oracle_rejects_missing_or_mutated_wheel() -> None:
    payload = {
        "info": {"version": "1.0.0"},
        "urls": [
            {
                "filename": "mac.whl",
                "packagetype": "bdist_wheel",
                "digests": {"sha256": "a" * 64},
                "url": "https://example.test/mac.whl",
            }
        ],
    }
    with pytest.raises(RuntimeError, match="wheel set/SHA drifted"):
        verifier.validate_remote_release(release(), payload)


def test_registry_oracle_accepts_only_the_exact_closed_set() -> None:
    payload = {
        "info": {"version": "1.0.0"},
        "urls": [
            {
                "filename": "mac.whl",
                "packagetype": "bdist_wheel",
                "digests": {"sha256": "a" * 64},
                "url": "https://example.test/mac.whl",
            },
            {
                "filename": "linux.whl",
                "packagetype": "bdist_wheel",
                "digests": {"sha256": "b" * 64},
                "url": "https://example.test/linux.whl",
            },
        ],
    }
    assert verifier.validate_remote_release(release(), payload) == {
        "mac.whl": "https://example.test/mac.whl",
        "linux.whl": "https://example.test/linux.whl",
    }


def test_release_identity_is_derived_from_manifest_and_lock(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    project = tmp_path / "pyproject.toml"
    lock = tmp_path / "uv.lock"
    contract = tmp_path / "native-aec-contract.json"
    project.write_text(
        '[project]\ndependencies = ["autoark-eva-client-sdk[pyaudio,camera]==9.8.7"]\n',
        encoding="utf-8",
    )
    lock.write_text(
        """
[[package]]
name = "autoark-eva-client-sdk"
version = "9.8.7"
source = { registry = "https://pypi.org/simple" }
wheels = [
  { url = "https://files.example/sdk-9.8.7-cp311-abi3-macosx_11_0_arm64.whl", hash = "sha256:abc" },
]
""".lstrip(),
        encoding="utf-8",
    )
    contract.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "descriptorId": "eva-webrtc-aec3",
                "abi": 2,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(verifier, "PROJECT_PATH", project)
    monkeypatch.setattr(verifier, "LOCK_PATH", lock)
    monkeypatch.setattr(verifier, "CONTRACT_PATH", contract)

    assert verifier.read_release() == {
        "registry": "pypi",
        "package": "autoark-eva-client-sdk",
        "version": "9.8.7",
        "nativeAec": {"descriptorId": "eva-webrtc-aec3", "abi": 2},
        "wheels": [
            {
                "system": "Darwin",
                "machine": "arm64",
                "filename": "sdk-9.8.7-cp311-abi3-macosx_11_0_arm64.whl",
                "sha256": "abc",
            }
        ],
    }
