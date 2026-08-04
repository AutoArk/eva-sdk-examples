from __future__ import annotations

import pytest

from run_with_key_file import create_runtime_environment, parse_key_file


@pytest.mark.parametrize(
    "assignment",
    [
        "EVA_GATEWAY_API_KEY=ak-test-value",
        'EVA_GATEWAY_API_KEY="ak-test-value"',
        "export EVA_GATEWAY_API_KEY='ak-test-value'",
    ],
)
def test_parses_supported_key_assignments(assignment: str) -> None:
    assert parse_key_file(assignment) == {"EVA_GATEWAY_API_KEY": "ak-test-value"}


def test_ignores_unrelated_values_without_exposing_them() -> None:
    assert parse_key_file(
        "OTHER_SECRET=ignored\nEVA_GATEWAY_API_KEY=ak-test-value\n"
    ) == {"EVA_GATEWAY_API_KEY": "ak-test-value"}


@pytest.mark.parametrize(
    "contents",
    [
        "OTHER_SECRET=ignored",
        "EVA_GATEWAY_API_KEY=",
        "EVA_GATEWAY_API_KEY=ak has spaces",
        'EVA_GATEWAY_API_KEY="unmatched',
        "EVA_GATEWAY_API_KEY=one\nEVA_GATEWAY_API_KEY=two",
    ],
)
def test_rejects_missing_or_ambiguous_key(contents: str) -> None:
    with pytest.raises(ValueError):
        parse_key_file(contents)


def test_runtime_environment_replaces_stale_value() -> None:
    environment = create_runtime_environment(
        {"EVA_GATEWAY_API_KEY": "fresh"},
        {"PATH": "/usr/bin", "EVA_GATEWAY_API_KEY": "stale"},
    )
    assert environment == {"PATH": "/usr/bin", "EVA_GATEWAY_API_KEY": "fresh"}
