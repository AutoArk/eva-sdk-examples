from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).parents[4]
    / ".agents/skills/verify-eva-python-demo-registry/scripts/verify_registry_install.py"
)
SPEC = importlib.util.spec_from_file_location("verify_registry_install", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
verifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)


def release() -> dict[str, object]:
    return {
        "version": "0.0.1.dev1",
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
        "info": {"version": "0.0.1.dev1"},
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
        "info": {"version": "0.0.1.dev1"},
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
