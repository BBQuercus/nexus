#!/usr/bin/env python3
"""Manage Azure AI Foundry model registrations in LiteLLM.

This bypasses the LiteLLM UI and calls the proxy admin API directly.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
DEFAULT_TEAM_IDS = [
    "2b75921c-0248-4a5c-86e5-07c4301ea696",
    "7084055f-1efd-4700-be78-56209d890aa9",
]


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")
    for key in ("LITE_LLM_URL", "LITE_LLM_API_KEY"):
        if key not in values and os.getenv(key):
            values[key] = os.environ[key]
    missing = [key for key in ("LITE_LLM_URL", "LITE_LLM_API_KEY") if not values.get(key)]
    if missing:
        raise SystemExit(f"Missing required settings: {', '.join(missing)}")
    return values


def request_json(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    env = load_env()
    url = env["LITE_LLM_URL"].rstrip("/") + path
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        method=method,
        data=body,
        headers={
            "Authorization": f"Bearer {env['LITE_LLM_API_KEY']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8", "replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"{method} {path} failed with {exc.code}: {detail or exc.reason}") from exc


def default_dummy_api_key() -> str | None:
    env = load_env()
    return env.get("DUMMY_API_KEY") or os.getenv("DUMMY_API_KEY")


def _resolve_api_key(args_key: str | None, preset: dict[str, Any]) -> str | None:
    """Resolve API key: explicit --api-key flag > preset's api_key_env > global DUMMY_API_KEY."""
    if args_key is not None:
        return args_key
    env_var = preset.get("api_key_env")
    if env_var:
        env = load_env()
        return env.get(env_var) or os.getenv(env_var)
    return default_dummy_api_key()


def build_payload(
    *,
    alias: str,
    model: str,
    api_base: str,
    input_cost: float,
    output_cost: float,
    max_input_tokens: int,
    max_output_tokens: int,
    supports_vision: bool,
    api_key: str | None = None,
    supports_audio_input: bool = False,
    supports_audio_output: bool = False,
    team_ids: list[str] | None = None,
    custom_llm_provider: str = "azure_ai",
    mode: str = "chat",
    api_version: str | None = None,
) -> dict[str, Any]:
    is_chat = mode == "chat"
    litellm_params: dict[str, Any] = {
        "model": model,
        "api_base": api_base,
        "custom_llm_provider": custom_llm_provider,
        "use_in_pass_through": False,
        "use_litellm_proxy": False,
        "merge_reasoning_content_in_choices": False,
    }
    if api_key:
        litellm_params["api_key"] = api_key
    if api_version:
        litellm_params["api_version"] = api_version

    return {
        "model_name": alias,
        "litellm_params": litellm_params,
        "model_info": {
            "mode": mode,
            "max_tokens": max_output_tokens,
            "max_input_tokens": max_input_tokens,
            "max_output_tokens": max_output_tokens,
            "input_cost_per_token": input_cost / 1_000_000,
            "output_cost_per_token": output_cost / 1_000_000,
            "litellm_provider": custom_llm_provider,
            "supports_function_calling": is_chat,
            "supports_tool_choice": is_chat,
            "supports_response_schema": is_chat,
            "supports_vision": supports_vision,
            "supports_audio_input": supports_audio_input,
            "supports_audio_output": supports_audio_output,
            "direct_access": True,
            "access_via_team_ids": team_ids or DEFAULT_TEAM_IDS,
        },
    }


PRESETS: dict[str, dict[str, Any]] = {
    "gpt-oss-120b": {
        "alias": "azure_ai/gpt-oss-120b",
        "model": "azure_ai/gpt-oss-120b",
        "api_base": "https://arti-llms.services.ai.azure.com/models/chat/completions",
        "input_cost": 0.15,
        "output_cost": 0.60,
        "max_input_tokens": 131072,
        "max_output_tokens": 131072,
        "supports_vision": False,
    },
    "kimi-k2.5": {
        "alias": "azure_ai/kimi-k2.5",
        "model": "azure_ai/kimi-k2.5",
        "api_base": "https://arti-llms.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview",
        "input_cost": 0.60,
        "output_cost": 3.00,
        "max_input_tokens": 262144,
        "max_output_tokens": 262144,
        "supports_vision": True,
    },
    "deepseek-v3.2": {
        "alias": "azure_ai/deepseek-v3.2",
        "model": "azure_ai/deepseek-v3.2",
        "api_base": "https://arti-llms.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview",
        "input_cost": 0.58,
        "output_cost": 1.68,
        "max_input_tokens": 163840,
        "max_output_tokens": 163840,
        "supports_vision": False,
    },
    "grok-4-fast-reasoning": {
        "alias": "azure_ai/grok-4-fast-reasoning",
        "model": "azure_ai/grok-4-fast-reasoning",
        "api_base": "https://arti-llms.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview",
        "input_cost": 0.20,
        "output_cost": 0.50,
        "max_input_tokens": 131072,
        "max_output_tokens": 131072,
        "supports_vision": False,
    },
    "model-router": {
        "alias": "azure_ai/model_router",
        "model": "azure_ai/model_router",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/model-router/chat/completions?api-version=2025-01-01-preview",
        "input_cost": 0.14,
        "output_cost": 0.00,
        "max_input_tokens": 0,
        "max_output_tokens": 0,
        "supports_vision": False,
    },
    "gpt-5.3-chat": {
        "alias": "azure_ai/gpt-5.3-chat",
        "model": "azure_ai/gpt-5.3-chat",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/gpt-5.3-chat/chat/completions?api-version=2025-01-01-preview",
        "input_cost": 15.00,
        "output_cost": 60.00,
        "max_input_tokens": 400000,
        "max_output_tokens": 128000,
        "supports_vision": False,
    },
    "gpt-5.4-mini": {
        "alias": "azure_ai/gpt-5.4-mini",
        "model": "azure_ai/gpt-5.4-mini",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/gpt-5.4-mini/chat/completions?api-version=2025-04-01-preview",
        "input_cost": 0.75,
        "output_cost": 4.50,
        "max_input_tokens": 400000,
        "max_output_tokens": 128000,
        "supports_vision": True,
    },
    "gpt-audio-1.5": {
        "alias": "azure_ai/gpt-audio-1.5",
        "model": "azure_ai/gpt-audio-1.5",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/gpt-audio-1.5/chat/completions?api-version=2025-01-01-preview",
        "input_cost": 2.50,
        "output_cost": 10.00,
        "max_input_tokens": 128000,
        "max_output_tokens": 16384,
        "supports_vision": False,
        "supports_audio_input": True,
        "supports_audio_output": True,
    },
    "gpt-5.4": {
        "alias": "gpt-5.4",
        "model": "gpt-5.4",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/gpt-5.4/chat/completions?api-version=2025-04-01-preview",
        "input_cost": 15.0,
        "output_cost": 60.0,
        "max_input_tokens": 400000,
        "max_output_tokens": 128000,
        "supports_vision": True,
    },
    "gpt-5.4-pro": {
        "alias": "gpt-5.4-pro",
        "model": "azure/gpt-5.4-pro",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com",
        "api_version": "2025-04-01-preview",
        "input_cost": 15.0,
        "output_cost": 60.0,
        "max_input_tokens": 400000,
        "max_output_tokens": 128000,
        "supports_vision": True,
        "custom_llm_provider": "azure",
    },
    "sora-2": {
        "alias": "sora-2",
        "model": "sora-2",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/v1/videos",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "max_input_tokens": 0,
        "max_output_tokens": 0,
        "supports_vision": False,
        "mode": "image_generation",
    },
    "tts-hd": {
        "alias": "tts-hd",
        "model": "tts-hd",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/deployments/tts-hd",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "max_input_tokens": 0,
        "max_output_tokens": 0,
        "supports_vision": False,
        "custom_llm_provider": "openai",
        "mode": "audio",
        "supports_audio_output": True,
    },
    "o3-pro": {
        "alias": "o3-pro",
        "model": "azure/o3-pro",
        "api_base": "https://arti-cgpt-rg-swc-aoai.openai.azure.com",
        "api_version": "2025-04-01-preview",
        "input_cost": 10.0,
        "output_cost": 40.0,
        "max_input_tokens": 200000,
        "max_output_tokens": 100000,
        "supports_vision": False,
        "custom_llm_provider": "azure",
    },
}


def _sora_headers() -> dict[str, str]:
    env = load_env()
    api_key = env.get("SORA_API_KEY") or env.get("DUMMY_API_KEY") or ""
    return {"Authorization": f"Bearer {api_key}", "api-key": api_key}


def cmd_poll_video(args: argparse.Namespace) -> None:
    base = "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/v1/videos"
    req = urllib.request.Request(f"{base}/{args.job_id}", method="GET", headers=_sora_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8", "replace"))
            print(json.dumps(data, indent=2))
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')}")


def cmd_download_video(args: argparse.Namespace) -> None:
    base = "https://arti-cgpt-rg-swc-aoai.openai.azure.com/openai/v1/videos"
    out_path = Path(args.output or f"{args.job_id}.mp4")
    # Try known content sub-paths in order
    for sub_path in (f"{args.job_id}/content/video", f"{args.job_id}/content", args.job_id):
        url = f"{base}/{sub_path}"
        req = urllib.request.Request(url, method="GET", headers=_sora_headers())
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                content_type = response.headers.get("Content-Type", "")
                raw = response.read()
            if raw[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20') or raw[4:8] == b'ftyp' or "video" in content_type:
                out_path.write_bytes(raw)
                print(f"Saved {len(raw) // 1024} KB → {out_path}")
                return
            # JSON response — print and try next sub-path
            print(f"  {sub_path}: {raw.decode('utf-8', 'replace')[:200]}")
        except urllib.error.HTTPError as exc:
            print(f"  {sub_path}: HTTP {exc.code} {exc.read().decode('utf-8', 'replace')[:100]}")
    print("Could not locate video content — check the sub-paths above for clues.")


def cmd_test_direct(args: argparse.Namespace) -> None:
    """Call a preset's api_base directly, bypassing LiteLLM, to verify the Azure endpoint."""
    preset = dict(PRESETS[args.preset])
    api_key = _resolve_api_key(args.api_key, preset)
    api_base = preset["api_base"]
    mode = preset.get("mode", "chat")

    if mode == "chat":
        payload: dict[str, Any] = {
            "model": preset["model"],
            "messages": [{"role": "user", "content": "Say hello in one word."}],
            "max_tokens": 20,
        }
        api_version = preset.get("api_version")
        if api_version and "api-version" not in api_base:
            sep = "&" if "?" in api_base else "?"
            api_base = f"{api_base}{sep}api-version={api_version}"
    elif mode == "image_generation":
        payload = {
            "model": preset["model"],
            "prompt": "A red circle on a white background.",
        }
    else:
        raise SystemExit(f"test-direct not implemented for mode '{mode}'")

    req = urllib.request.Request(
        api_base,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "api-key": api_key or "",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8", "replace")
            data = json.loads(raw)
            print(json.dumps(data, indent=2)[:2000])
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        print(f"HTTP {exc.code}: {detail[:1000]}")


def cmd_list(_: argparse.Namespace) -> None:
    data = request_json("GET", "/model/info").get("data", [])
    for item in data:
        name = str(item.get("model_name", ""))
        if name.startswith("azure_ai/"):
            params = item.get("litellm_params", {})
            info = item.get("model_info", {})
            print(
                json.dumps(
                    {
                        "model_name": name,
                        "model": params.get("model"),
                        "api_base": params.get("api_base"),
                        "credential_name": params.get("litellm_credential_name"),
                        "input_cost_per_token": info.get("input_cost_per_token"),
                        "output_cost_per_token": info.get("output_cost_per_token"),
                    }
                )
            )


def _find_model_ids(model_name: str) -> list[str]:
    """Return all internal LiteLLM IDs registered under a given model_name alias."""
    data = request_json("GET", "/model/info").get("data", [])
    return [item["model_info"]["id"] for item in data if item.get("model_name") == model_name and item.get("model_info", {}).get("id")]


def cmd_delete(args: argparse.Namespace) -> None:
    ids = _find_model_ids(args.model_name)
    if not ids:
        print(f"No registrations found for '{args.model_name}'")
        return
    for model_id in ids:
        result = request_json("POST", "/model/delete", {"id": model_id})
        print(f"Deleted {model_id}: {json.dumps(result)}")


def cmd_replace_preset(args: argparse.Namespace) -> None:
    preset = dict(PRESETS[args.preset])
    alias = preset["alias"]
    ids = _find_model_ids(alias)
    if ids:
        for model_id in ids:
            request_json("POST", "/model/delete", {"id": model_id})
        print(f"Deleted {len(ids)} existing registration(s) for '{alias}'")
    api_key = _resolve_api_key(args.api_key, preset)
    preset.pop("api_key_env", None)
    payload = build_payload(**preset, api_key=api_key)
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return
    print(json.dumps(request_json("POST", "/model/new", payload), indent=2))


def cmd_add_preset(args: argparse.Namespace) -> None:
    preset = dict(PRESETS[args.preset])
    api_key = _resolve_api_key(args.api_key, preset)
    preset.pop("api_key_env", None)
    payload = build_payload(**preset, api_key=api_key)
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return
    print(json.dumps(request_json("POST", "/model/new", payload), indent=2))


def cmd_add_custom(args: argparse.Namespace) -> None:
    payload = build_payload(
        alias=args.alias,
        model=args.model,
        api_base=args.api_base,
        input_cost=args.input_cost,
        output_cost=args.output_cost,
        max_input_tokens=args.max_input_tokens,
        max_output_tokens=args.max_output_tokens,
        supports_vision=args.supports_vision,
        api_key=args.api_key,
        supports_audio_input=args.supports_audio_input,
        supports_audio_output=args.supports_audio_output,
        custom_llm_provider=args.custom_llm_provider,
        mode=args.mode,
    )
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return
    print(json.dumps(request_json("POST", "/model/new", payload), indent=2))


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    poll_cmd = sub.add_parser("poll-video", help="Check status of a Sora 2 video generation job")
    poll_cmd.add_argument("job_id", help="Job ID returned by Sora, e.g. video_69c6a0474a4c...")
    poll_cmd.set_defaults(func=cmd_poll_video)

    dl_cmd = sub.add_parser("download-video", help="Download completed Sora 2 video to a file")
    dl_cmd.add_argument("job_id", help="Completed job ID")
    dl_cmd.add_argument("--output", help="Output filename (default: <job_id>.mp4)")
    dl_cmd.set_defaults(func=cmd_download_video)

    test_cmd = sub.add_parser("test-direct", help="Call a preset's Azure endpoint directly, bypassing LiteLLM")
    test_cmd.add_argument("preset", choices=sorted(PRESETS))
    test_cmd.add_argument("--api-key", default=None)
    test_cmd.set_defaults(func=cmd_test_direct)

    list_cmd = sub.add_parser("list", help="List current azure_ai models from LiteLLM")
    list_cmd.set_defaults(func=cmd_list)

    delete_cmd = sub.add_parser("delete", help="Delete all LiteLLM registrations for a model_name alias")
    delete_cmd.add_argument("model_name", help="LiteLLM model_name alias to delete, e.g. gpt-5.4")
    delete_cmd.set_defaults(func=cmd_delete)

    replace_cmd = sub.add_parser("replace-preset", help="Delete existing registrations and re-add a preset (use after config changes)")
    replace_cmd.add_argument("preset", choices=sorted(PRESETS))
    replace_cmd.add_argument("--api-key", default=None)
    replace_cmd.add_argument("--dry-run", action="store_true")
    replace_cmd.set_defaults(func=cmd_replace_preset)

    preset_cmd = sub.add_parser("add-preset", help="Add a predefined Foundry chat model")
    preset_cmd.add_argument("preset", choices=sorted(PRESETS))
    preset_cmd.add_argument("--api-key", default=None, help="Override API key (default: preset's api_key_env or DUMMY_API_KEY)")
    preset_cmd.add_argument("--dry-run", action="store_true")
    preset_cmd.set_defaults(func=cmd_add_preset)

    custom_cmd = sub.add_parser("add-custom", help="Add a custom Foundry chat model")
    custom_cmd.add_argument("--alias", required=True, help="LiteLLM alias, e.g. azure_ai/my-model")
    custom_cmd.add_argument("--model", required=True, help="Provider model id, e.g. azure_ai/my-model")
    custom_cmd.add_argument("--api-base", required=True, help="Azure AI Foundry inference endpoint")
    custom_cmd.add_argument("--input-cost", required=True, type=float, help="USD per 1M input tokens")
    custom_cmd.add_argument("--output-cost", required=True, type=float, help="USD per 1M output tokens")
    custom_cmd.add_argument("--max-input-tokens", type=int, default=131072)
    custom_cmd.add_argument("--max-output-tokens", type=int, default=16384)
    custom_cmd.add_argument("--supports-vision", action="store_true")
    custom_cmd.add_argument("--supports-audio-input", action="store_true")
    custom_cmd.add_argument("--supports-audio-output", action="store_true")
    custom_cmd.add_argument("--custom-llm-provider", default="azure_ai", help="LiteLLM provider (azure_ai or openai)")
    custom_cmd.add_argument("--mode", default="chat", help="Model mode: chat, image_generation, audio")
    custom_cmd.add_argument("--api-key", default=default_dummy_api_key())
    custom_cmd.add_argument("--dry-run", action="store_true")
    custom_cmd.set_defaults(func=cmd_add_custom)

    return p


def main() -> int:
    args = parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
