from __future__ import annotations

import json

from eva_client_sdk import CommandCall, CommandContext

from commands import _handle_convert_temperature, build_demo_commands


class Signal:
    @property
    def cancelled(self) -> bool:
        return False

    async def wait(self) -> None:
        return None


def test_command_registry_preserves_time_and_temperature() -> None:
    names = [item.definition.name for item in build_demo_commands().registrations]
    assert names == ["get_current_time", "convert_temperature"]


def test_temperature_command_converts_celsius_to_fahrenheit() -> None:
    definition = build_demo_commands().registrations[1].definition
    arguments = {"value": 25, "from_unit": "celsius", "to_unit": "fahrenheit"}
    call = CommandCall(
        id="call-1",
        name=definition.name,
        arguments_json=json.dumps(arguments),
        arguments=arguments,
        definition=definition,
        stream_id="stream",
        turn_id="turn",
    )
    context = CommandContext(
        stream_id="stream", turn_id="turn", signal=Signal()  # type: ignore[arg-type]
    )
    result = _handle_convert_temperature(call, context)
    assert result.ok
    assert result.message is not None and "77" in result.message
