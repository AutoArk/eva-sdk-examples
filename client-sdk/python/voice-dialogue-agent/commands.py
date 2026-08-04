from __future__ import annotations

from datetime import datetime

from eva_client_sdk import (
    CommandCall,
    CommandContext,
    CommandDefinition,
    CommandParameter,
    CommandRegistration,
    CommandResult,
    CommandsConfig,
)

_TEMPERATURE_UNIT_LABELS = {"celsius": "摄氏度", "fahrenheit": "华氏度"}


def _handle_current_time(call: CommandCall, context: CommandContext) -> CommandResult:
    del call, context
    now = datetime.now().astimezone()
    zone = now.strftime("%Z") or "本地时区"
    return CommandResult(
        ok=True,
        message=f"当前本地时间是 {now.strftime('%Y年%m月%d日 %H:%M')}（{zone}）。",
    )


def _handle_convert_temperature(
    call: CommandCall,
    context: CommandContext,
) -> CommandResult:
    del context
    value = call.arguments.get("value")
    from_unit = call.arguments.get("from_unit")
    to_unit = call.arguments.get("to_unit")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return CommandResult(ok=False, message="温度数值缺失或不是数字。")
    if from_unit not in _TEMPERATURE_UNIT_LABELS or to_unit not in _TEMPERATURE_UNIT_LABELS:
        return CommandResult(ok=False, message="温度单位必须是 celsius 或 fahrenheit。")
    celsius = (
        float(value)
        if from_unit == "celsius"
        else (float(value) - 32.0) * 5.0 / 9.0
    )
    converted = celsius if to_unit == "celsius" else celsius * 9.0 / 5.0 + 32.0
    return CommandResult(
        ok=True,
        message=(
            f"{value} {_TEMPERATURE_UNIT_LABELS[str(from_unit)]} 约等于 "
            f"{round(converted, 2)} {_TEMPERATURE_UNIT_LABELS[str(to_unit)]}。"
        ),
    )


def build_demo_commands() -> CommandsConfig:
    return CommandsConfig(
        registrations=(
            CommandRegistration(
                definition=CommandDefinition(
                    name="get_current_time",
                    description="获取当前本地时间。当用户询问现在几点或当前时间时调用。",
                ),
                handler=_handle_current_time,
            ),
            CommandRegistration(
                definition=CommandDefinition(
                    name="convert_temperature",
                    description="在摄氏度与华氏度之间换算温度。当用户要求温度换算时调用。",
                    parameters=(
                        CommandParameter(
                            name="value",
                            type="number",
                            required=True,
                            description="要换算的温度数值。",
                        ),
                        CommandParameter(
                            name="from_unit",
                            type="string",
                            required=True,
                            description="源温度单位。",
                            enum=("celsius", "fahrenheit"),
                        ),
                        CommandParameter(
                            name="to_unit",
                            type="string",
                            required=True,
                            description="目标温度单位。",
                            enum=("celsius", "fahrenheit"),
                        ),
                    ),
                ),
                handler=_handle_convert_temperature,
            ),
        )
    )
