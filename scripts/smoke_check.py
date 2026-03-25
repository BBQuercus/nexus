#!/usr/bin/env python3
"""Minimal post-deploy smoke checks for Railway environments."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def fetch(url: str, timeout: float = 15.0) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "nexus-smoke-check/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.getcode(), response.read().decode("utf-8", errors="replace")


def require_ok(name: str, url: str) -> str:
    try:
        status, body = fetch(url)
    except urllib.error.URLError as exc:
        raise SystemExit(f"{name} check failed for {url}: {exc}") from exc

    if not 200 <= status < 300:
        raise SystemExit(f"{name} check failed for {url}: HTTP {status}")

    print(f"{name}: ok ({status}) -> {url}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend-url", required=True)
    parser.add_argument("--backend-url", required=True)
    args = parser.parse_args()

    require_ok("frontend", args.frontend_url)
    ready_body = require_ok("backend-ready", f"{args.backend_url.rstrip('/')}/ready")
    health_body = require_ok("backend-health", f"{args.backend_url.rstrip('/')}/health")

    try:
        ready_payload = json.loads(ready_body)
        health_payload = json.loads(health_body)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"health payload parsing failed: {exc}") from exc

    if ready_payload.get("status") != "ok":
        raise SystemExit(f"backend readiness not ok: {ready_payload}")
    if health_payload.get("status") not in {"ok", "degraded"}:
        raise SystemExit(f"backend health unexpected: {health_payload}")

    print("smoke checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
