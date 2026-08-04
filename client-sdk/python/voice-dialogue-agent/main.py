from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence

from audio_setup import inspect_audio
from sdk_usage import start_eva_agent
from settings import parse_args


async def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    audio = inspect_audio(args)
    if audio is None:
        return

    api_key = os.environ.get("EVA_GATEWAY_API_KEY", "")
    if not api_key:
        raise RuntimeError("请先设置 EVA_GATEWAY_API_KEY。")

    print(
        "demo.config: "
        f"greeting_profile={args.greeting_profile} "
        f"initial_playback_guard_ms={args.initial_playback_guard_ms}",
        flush=True,
    )
    print(
        "demo.tts: "
        f"tts_model={args.tts_model} tts_voice={args.tts_voice} "
        f"tts_sample_rate={args.tts_sample_rate}",
        flush=True,
    )

    agent, unsubscribe = await start_eva_agent(api_key=api_key, args=args, audio=audio)
    try:
        await asyncio.to_thread(
            input,
            "可以开始说话；说完后停顿约0.4秒，看到回复后按回车退出。\n",
        )
    finally:
        unsubscribe()
        await agent.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as error:
        raise SystemExit(f"voice.demo.error: {error}") from None
