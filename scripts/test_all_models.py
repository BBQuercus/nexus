#!/usr/bin/env python3
"""Manual smoke test: send a 'hello' to every model and verify a non-empty response.

Uses stream_chat from backend/services/llm.py so any param-filtering logic
(temperature guards, tool-choice guards, etc.) is exercised automatically.

Usage:
    uv run scripts/test_all_models.py
    uv run scripts/test_all_models.py --models gpt-4o-swc azure_ai/gpt-5.3-chat
    uv run scripts/test_all_models.py --temperature 0.7
    uv run scripts/test_all_models.py --concurrency 4
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# Expose backend package to import path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rich.console import Console
from rich.table import Table
from rich import box
from rich.text import Text

from backend.services.llm import stream_chat, MODEL_PRICING, MODELS_WITHOUT_TEMPERATURE

console = Console()

ALL_MODELS: list[str] = list(MODEL_PRICING.keys())

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


async def probe_model(model: str, temperature: float | None) -> Result:
    start = time.monotonic()
    skip_temp = model in MODELS_WITHOUT_TEMPERATURE
    temp = None if (temperature is None or skip_temp) else temperature

    try:
        text = ""
        async for chunk in stream_chat(PROMPT, model, temperature=temp):
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    text += delta.content
        text = text.strip()
        if not text:
            return Result(model=model, ok=False, elapsed=time.monotonic() - start,
                          error="empty response", skipped_temperature=skip_temp)
        return Result(model=model, ok=True, elapsed=time.monotonic() - start,
                      response=text[:60], skipped_temperature=skip_temp)
    except Exception as exc:
        return Result(model=model, ok=False, elapsed=time.monotonic() - start,
                      error=str(exc)[:100], skipped_temperature=skip_temp)


async def run(models: list[str], temperature: float | None, concurrency: int) -> list[Result]:
    sem = asyncio.Semaphore(concurrency)

    async def bounded(model: str) -> Result:
        async with sem:
            return await asyncio.wait_for(probe_model(model, temperature), timeout=TIMEOUT)

    tasks = [bounded(m) for m in models]
    results: list[Result] = []
    for coro in asyncio.as_completed(tasks):
        r = await coro
        icon = "[green]✓[/]" if r.ok else "[red]✗[/]"
        console.print(f"  {icon} {r.model}", highlight=False)
        results.append(r)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe LLM models with a hello message")
    parser.add_argument("--models", nargs="*", help="Subset of models to test (default: all)")
    parser.add_argument("--temperature", type=float, default=None,
                        help="Temperature to send (skipped for models that don't support it)")
    parser.add_argument("--concurrency", type=int, default=5)
    args = parser.parse_args()

    models = args.models or ALL_MODELS

    console.rule("[bold]Model smoke test[/]")
    if args.temperature is not None:
        console.print(f"  temperature={args.temperature}  "
                      f"(skipped for {len(MODELS_WITHOUT_TEMPERATURE)} model(s))\n")
    else:
        console.print(f"  {len(models)} model(s)  ·  concurrency={args.concurrency}\n")

    results: list[Result] = asyncio.run(run(models, args.temperature, args.concurrency))
    results.sort(key=lambda r: r.model)

    table = Table(box=box.SIMPLE_HEAD, show_edge=False, pad_edge=False)
    table.add_column("Model", style="dim", no_wrap=True)
    table.add_column("Status", justify="center", width=6)
    table.add_column("Time", justify="right", width=6)
    table.add_column("Notes")

    for r in results:
        status = Text("ok", style="green") if r.ok else Text("FAIL", style="bold red")
        notes_parts: list[str] = []
        if r.skipped_temperature and args.temperature is not None:
            notes_parts.append("[yellow]temp skipped[/]")
        if r.ok:
            notes_parts.append(f"[dim]{repr(r.response)}[/]")
        else:
            notes_parts.append(f"[red]{r.error}[/]")
        table.add_row(r.model, status, f"{r.elapsed:.1f}s", Text.from_markup("  ".join(notes_parts)))

    console.print()
    console.print(table)

    passed = sum(1 for r in results if r.ok)
    failed = [r for r in results if not r.ok]

    console.rule()
    if failed:
        console.print(f"[bold red]{passed}/{len(results)} passed[/]  —  "
                      + "  ".join(f"[red]{r.model}[/]" for r in failed))
    else:
        console.print(f"[bold green]{passed}/{len(results)} passed[/]")

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
