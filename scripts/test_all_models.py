#!/usr/bin/env python3
"""Manual smoke test: send a 'hello' to every model and verify a non-empty response.

Usage:
    uv run scripts/test_all_models.py
    uv run scripts/test_all_models.py --models gpt-5-gwc azure_ai/gpt-5.3-chat
    uv run scripts/test_all_models.py --temperature 0.7   # test with non-default temperature
    uv run scripts/test_all_models.py --concurrency 4
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass, field

import openai

# Bootstrap backend config without importing the full app
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

LITE_LLM_URL = os.environ["LITE_LLM_URL"].rstrip("/") + "/v1"
LITE_LLM_API_KEY = os.environ["LITE_LLM_API_KEY"]

# All models known to the system — keep in sync with backend/services/llm.py MODEL_PRICING
ALL_MODELS: list[str] = [
    "azure_ai/claude-sonnet-4-5-swc",
    "azure_ai/claude-opus-4-5-swc",
    "azure_ai/claude-opus-4-1-swc",
    "azure_ai/claude-haiku-4-5-swc",
    "gpt-4o-swc",
    "gpt-4o-mini-swc",
    "gpt-4.1-chn",
    "gpt-4.1-mini-chn",
    "gpt-4.1-nano-swc",
    "gpt-5-gwc",
    "gpt-5-mini-gwc",
    "gpt-5-nano-gwc",
    "gpt-5.1-use2",
    "gpt-5.2-use2",
    "o1-gwc",
    "Llama-3.3-70B-Instruct",
    "azure_ai/model_router",
    "azure_ai/gpt-5.3-chat",
    "azure_ai/gpt-oss-120b",
    "azure_ai/kimi-k2.5",
    "azure_ai/deepseek-v3.2",
    "azure_ai/grok-4-fast-reasoning",
    "azure_ai/gpt-5.4-mini",
]

# Models that must not receive a temperature param (only accept default/1.0)
MODELS_WITHOUT_TEMPERATURE: set[str] = {
    "gpt-5-gwc",
    "gpt-5-mini-gwc",
    "gpt-5-nano-gwc",
    "gpt-5.1-use2",
    "gpt-5.2-use2",
    "azure_ai/gpt-5.3-chat",
}

PROMPT = [{"role": "user", "content": "Say hello in one word."}]
TIMEOUT = 60.0


@dataclass
class Result:
    model: str
    ok: bool
    elapsed: float
    response: str = ""
    error: str = ""
    skipped_temperature: bool = False


async def probe_model(client: openai.AsyncOpenAI, model: str, temperature: float | None) -> Result:
    start = time.monotonic()
    kwargs: dict = {"model": model, "messages": PROMPT, "max_tokens": 32}

    skip_temp = model in MODELS_WITHOUT_TEMPERATURE
    if temperature is not None and not skip_temp:
        kwargs["temperature"] = temperature

    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(**kwargs),
            timeout=TIMEOUT,
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            return Result(model=model, ok=False, elapsed=time.monotonic() - start,
                          error="empty response", skipped_temperature=skip_temp)
        return Result(model=model, ok=True, elapsed=time.monotonic() - start,
                      response=text[:80], skipped_temperature=skip_temp)
    except Exception as exc:
        return Result(model=model, ok=False, elapsed=time.monotonic() - start,
                      error=str(exc)[:120], skipped_temperature=skip_temp)


async def run(models: list[str], temperature: float | None, concurrency: int) -> list[Result]:
    client = openai.AsyncOpenAI(base_url=LITE_LLM_URL, api_key=LITE_LLM_API_KEY)
    sem = asyncio.Semaphore(concurrency)

    async def bounded(model: str) -> Result:
        async with sem:
            return await probe_model(client, model, temperature)

    return await asyncio.gather(*[bounded(m) for m in models])


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe all LLM models with a hello message")
    parser.add_argument("--models", nargs="*", help="Subset of models to test (default: all)")
    parser.add_argument("--temperature", type=float, default=None,
                        help="Temperature to send (skipped for models that don't support it)")
    parser.add_argument("--concurrency", type=int, default=5,
                        help="Max parallel requests (default: 5)")
    args = parser.parse_args()

    models = args.models or ALL_MODELS
    results: list[Result] = asyncio.run(run(models, args.temperature, args.concurrency))

    passed = [r for r in results if r.ok]
    failed = [r for r in results if not r.ok]

    col_w = max(len(r.model) for r in results)

    print(f"\n{'MODEL':<{col_w}}  {'STATUS':<6}  {'TIME':>6}  NOTES")
    print("-" * (col_w + 40))
    for r in sorted(results, key=lambda r: r.model):
        status = "ok" if r.ok else "FAIL"
        notes_parts = []
        if r.skipped_temperature and args.temperature is not None:
            notes_parts.append("temp skipped")
        if r.ok:
            notes_parts.append(repr(r.response))
        else:
            notes_parts.append(r.error)
        notes = "  ".join(notes_parts)
        print(f"{r.model:<{col_w}}  {status:<6}  {r.elapsed:>5.1f}s  {notes}")

    print()
    print(f"{len(passed)}/{len(results)} models ok", end="")
    if failed:
        print(f"  —  {len(failed)} failed: {', '.join(r.model for r in failed)}")
    else:
        print()

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
