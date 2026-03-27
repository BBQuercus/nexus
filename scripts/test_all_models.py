#!/usr/bin/env python3
"""Manual smoke test: send a 'hello' to every chat model and verify a non-empty response.
Also probes image models, saving output files for inspection.

Uses stream_chat from backend/services/llm.py so any param-filtering logic
(temperature guards, tool-choice guards, etc.) is exercised automatically.

Usage:
    uv run scripts/test_all_models.py
    uv run scripts/test_all_models.py --models gpt-4o-swc azure_ai/gpt-5.3-chat
    uv run scripts/test_all_models.py --temperature 0.7
    uv run scripts/test_all_models.py --concurrency 4
    uv run scripts/test_all_models.py --include-images
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

# Expose backend package to import path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rich.console import Console
from rich.table import Table
from rich import box
from rich.text import Text

from backend.services.llm import stream_chat, MODEL_PRICING, MODELS_WITHOUT_TEMPERATURE, client

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values

console = Console()

ALL_MODELS: list[str] = list(MODEL_PRICING.keys())

# Image models to probe (model_id, display_name)
IMAGE_MODELS: list[tuple[str, str]] = [
    ("gpt-image-1.5-swc", "GPT Image 1.5"),
    ("azure_ai/flux.2-pro", "FLUX.2 Pro"),
]

# Video models — probed directly against Azure (job submission only, no polling)
VIDEO_MODELS: list[tuple[str, str]] = [
    ("sora-2", "Sora 2"),
]

IMAGE_PROMPT = "A simple red circle on a white background."
CHAT_PROMPT = [{"role": "user", "content": "Say hello in one word."}]
CHAT_TIMEOUT = 120.0
IMAGE_TIMEOUT = 180.0

IMAGE_OUTPUT_DIR = Path(__file__).resolve().parent / "image_outputs"


@dataclass
class Result:
    model: str
    ok: bool
    elapsed: float
    response: str = ""
    error: str = ""
    skipped_temperature: bool = False


@dataclass
class ImageResult:
    model: str
    ok: bool
    elapsed: float
    saved_path: Path | None = None
    error: str = ""
    extra: dict = field(default_factory=dict)


async def probe_model(model: str, temperature: float | None) -> Result:
    start = time.monotonic()
    skip_temp = model in MODELS_WITHOUT_TEMPERATURE
    temp = None if (temperature is None or skip_temp) else temperature

    try:
        text = ""
        async for chunk in stream_chat(CHAT_PROMPT, model, temperature=temp):
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


async def probe_image_model(model_id: str) -> ImageResult:
    start = time.monotonic()
    IMAGE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = model_id.replace("/", "_").replace(".", "-")

    try:
        response = await asyncio.wait_for(
            client.images.generate(
                model=model_id,
                prompt=IMAGE_PROMPT,
                n=1,
            ),
            timeout=IMAGE_TIMEOUT,
        )

        if not response.data:
            return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                               error="empty data in response")

        item = response.data[0]
        extra: dict = {}
        if hasattr(item, "revised_prompt") and item.revised_prompt:
            extra["revised_prompt"] = item.revised_prompt

        # Prefer b64_json, fall back to url
        if item.b64_json:
            raw = base64.b64decode(item.b64_json)
            # Detect format by magic bytes
            ext = "mp4" if raw[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20') or raw[4:8] == b'ftyp' else "png"
            out_path = IMAGE_OUTPUT_DIR / f"{safe_name}.{ext}"
            out_path.write_bytes(raw)
        elif item.url:
            # Save URL to text file; optionally download
            url_file = IMAGE_OUTPUT_DIR / f"{safe_name}.url.txt"
            url_file.write_text(item.url)
            out_path = url_file
            extra["url"] = item.url
        else:
            return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                               error="response has neither b64_json nor url")

        return ImageResult(model=model_id, ok=True, elapsed=time.monotonic() - start,
                           saved_path=out_path, extra=extra)

    except Exception as exc:
        return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                           error=str(exc)[:120])


async def run_chat(models: list[str], temperature: float | None, concurrency: int) -> list[Result]:
    sem = asyncio.Semaphore(concurrency)

    async def bounded(model: str) -> Result:
        async with sem:
            try:
                return await asyncio.wait_for(probe_model(model, temperature), timeout=CHAT_TIMEOUT)
            except TimeoutError:
                return Result(model=model, ok=False, elapsed=CHAT_TIMEOUT, error=f"timeout after {CHAT_TIMEOUT:.0f}s")

    tasks = [bounded(m) for m in models]
    results: list[Result] = []
    for coro in asyncio.as_completed(tasks):
        r = await coro
        icon = "[green]✓[/]" if r.ok else "[red]✗[/]"
        console.print(f"  {icon} {r.model}", highlight=False)
        results.append(r)
    return results


async def probe_video_model(model_id: str) -> ImageResult:
    """Submit a Sora job directly to Azure and verify it queues — does not wait for completion."""
    start = time.monotonic()
    env = load_dotenv()
    api_key = env.get("SORA_API_KEY") or env.get("DUMMY_API_KEY") or env.get("LITE_LLM_API_KEY", "")
    base = "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/v1/videos"
    headers = {"Authorization": f"Bearer {api_key}", "api-key": api_key, "Content-Type": "application/json"}
    payload = {"model": model_id, "prompt": "A red circle on a white background."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            r = await http.post(base, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        job_id = data.get("id", "")
        status = data.get("status", "")
        if not job_id:
            return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                               error="no job ID in response")
        return ImageResult(model=model_id, ok=True, elapsed=time.monotonic() - start,
                           extra={"job_id": job_id, "status": status})
    except httpx.HTTPStatusError as e:
        return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                           error=f"HTTP {e.response.status_code}: {e.response.text[:80]}")
    except Exception as exc:
        return ImageResult(model=model_id, ok=False, elapsed=time.monotonic() - start,
                           error=str(exc)[:120])


async def run_images(models: list[tuple[str, str]]) -> list[ImageResult]:
    results: list[ImageResult] = []
    for model_id, display_name in models:
        console.print(f"  [dim]→[/] {display_name} ({model_id})", highlight=False)
        r = await probe_image_model(model_id)
        icon = "[green]✓[/]" if r.ok else "[red]✗[/]"
        console.print(f"  {icon} {display_name}", highlight=False)
        results.append(r)
    return results


async def run_videos(models: list[tuple[str, str]]) -> list[ImageResult]:
    results: list[ImageResult] = []
    for model_id, display_name in models:
        console.print(f"  [dim]→[/] {display_name} ({model_id})", highlight=False)
        r = await probe_video_model(model_id)
        icon = "[green]✓[/]" if r.ok else "[red]✗[/]"
        console.print(f"  {icon} {display_name}", highlight=False)
        results.append(r)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe LLM models with a hello message")
    parser.add_argument("--models", nargs="*", help="Subset of chat models to test (default: all)")
    parser.add_argument("--temperature", type=float, default=None,
                        help="Temperature to send (skipped for models that don't support it)")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--include-images", action="store_true", help="Also probe image/video models and save outputs")
    args = parser.parse_args()

    chat_models = args.models or ALL_MODELS
    overall_ok = True

    # ── Chat models ──────────────────────────────────────────────────────────
    console.rule("[bold]Chat model smoke test[/]")
    if args.temperature is not None:
        console.print(f"  temperature={args.temperature}  "
                      f"(skipped for {len(MODELS_WITHOUT_TEMPERATURE)} model(s))\n")
    else:
        console.print(f"  {len(chat_models)} model(s)  ·  concurrency={args.concurrency}\n")

    chat_results: list[Result] = asyncio.run(run_chat(chat_models, args.temperature, args.concurrency))
    chat_results.sort(key=lambda r: r.model)

    table = Table(box=box.SIMPLE_HEAD, show_edge=False, pad_edge=False)
    table.add_column("Model", style="dim", no_wrap=True)
    table.add_column("Status", justify="center", width=6)
    table.add_column("Time", justify="right", width=6)
    table.add_column("Notes")

    for r in chat_results:
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

    passed = sum(1 for r in chat_results if r.ok)
    failed_chat = [r for r in chat_results if not r.ok]
    console.rule()
    if failed_chat:
        console.print(f"[bold red]{passed}/{len(chat_results)} passed[/]  —  "
                      + "  ".join(f"[red]{r.model}[/]" for r in failed_chat))
        overall_ok = False
    else:
        console.print(f"[bold green]{passed}/{len(chat_results)} passed[/]")

    # ── Image models ─────────────────────────────────────────────────────────
    if args.include_images:
        all_media_results: list[ImageResult] = []

        console.print()
        console.rule("[bold]Image model smoke test[/]")
        console.print(f"  {len(IMAGE_MODELS)} model(s)  ·  output → {IMAGE_OUTPUT_DIR}\n")
        all_media_results += asyncio.run(run_images(IMAGE_MODELS))

        console.print()
        console.rule("[bold]Video model smoke test[/]")
        console.print(f"  {len(VIDEO_MODELS)} model(s)  ·  job submission only (no polling)\n")
        all_media_results += asyncio.run(run_videos(VIDEO_MODELS))

        img_table = Table(box=box.SIMPLE_HEAD, show_edge=False, pad_edge=False)
        img_table.add_column("Model", style="dim", no_wrap=True)
        img_table.add_column("Status", justify="center", width=6)
        img_table.add_column("Time", justify="right", width=6)
        img_table.add_column("Notes")

        for r in all_media_results:
            status = Text("ok", style="green") if r.ok else Text("FAIL", style="bold red")
            notes_parts = []
            if r.ok and r.saved_path:
                size_kb = r.saved_path.stat().st_size // 1024
                notes_parts.append(f"[dim]{r.saved_path.name} ({size_kb} KB)[/]")
                if "revised_prompt" in r.extra:
                    notes_parts.append(f'[dim italic]"{r.extra["revised_prompt"][:60]}"[/]')
            elif r.ok and r.extra.get("job_id"):
                notes_parts.append(f'[dim]job {r.extra["job_id"]} → {r.extra.get("status", "?")}[/]')
            elif not r.ok:
                notes_parts.append(f"[red]{r.error}[/]")
            img_table.add_row(r.model, status, f"{r.elapsed:.1f}s", Text.from_markup("  ".join(notes_parts)))

        console.print()
        console.print(img_table)

        passed_media = sum(1 for r in all_media_results if r.ok)
        failed_media = [r for r in all_media_results if not r.ok]
        console.rule()
        if failed_media:
            console.print(f"[bold red]{passed_media}/{len(all_media_results)} passed[/]  —  "
                          + "  ".join(f"[red]{r.model}[/]" for r in failed_media))
            overall_ok = False
        else:
            console.print(f"[bold green]{passed_media}/{len(all_media_results)} passed[/]")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
