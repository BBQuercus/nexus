import ipaddress
import json
import re
import time
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

import httpx

from backend.logging_config import get_logger

logger = get_logger("web")

DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_BROWSE_TIMEOUT_SECONDS = 10.0
MAX_API_BODY_CHARS = 8000
MAX_BROWSE_TEXT_CHARS = 4000
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

try:
    import trafilatura
except ImportError:  # pragma: no cover - fallback tested instead
    trafilatura = None  # type: ignore[assignment]


class UnsafeUrlError(ValueError):
    pass


class _LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for key, value in attrs:
            if key.lower() == "href" and value:
                self.links.append(value)


def _truncate_text(value: str, limit: int) -> tuple[str, bool]:
    if len(value) <= limit:
        return value, False
    return value[:limit], True


def _redact_auth_value(value: Any, secret: str | None) -> Any:
    if not secret:
        return value
    if isinstance(value, str):
        return value.replace(secret, "[REDACTED]")
    if isinstance(value, list):
        return [_redact_auth_value(item, secret) for item in value]
    if isinstance(value, dict):
        return {key: _redact_auth_value(item, secret) for key, item in value.items()}
    return value


def _sanitize_request_headers(headers: dict[str, str] | None, auth_value: str | None) -> dict[str, str]:
    sanitized: dict[str, str] = {}
    for key, value in (headers or {}).items():
        if key.lower() == "authorization":
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = _redact_auth_value(value, auth_value)
    return sanitized


def _validate_outbound_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if not parsed.netloc:
        raise UnsafeUrlError("URL must include a host")
    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("URL must include a valid host")
    if host.lower() in {"localhost", "localhost.localdomain"}:
        raise UnsafeUrlError("Localhost URLs are not allowed")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return url

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        raise UnsafeUrlError("Private or local network URLs are not allowed")
    return url


def _build_request_headers(
    headers: dict[str, str] | None,
    auth_type: str,
    auth_value: str | None,
    *,
    browser_like: bool = False,
) -> dict[str, str]:
    merged = dict(headers or {})
    if browser_like and "User-Agent" not in merged and "user-agent" not in merged:
        merged["User-Agent"] = BROWSER_USER_AGENT

    if auth_type == "bearer" and auth_value:
        merged["Authorization"] = f"Bearer {auth_value}"
    elif auth_type == "basic" and auth_value:
        merged["Authorization"] = f"Basic {auth_value}"

    return merged


def _extract_response_headers(response: httpx.Response) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key in ("content-type", "content-length"):
        value = response.headers.get(key)
        if value:
            headers[key] = value
    return headers


def _parse_api_body(response: httpx.Response, auth_value: str | None) -> tuple[Any, bool]:
    text = response.text
    truncated_text, was_truncated = _truncate_text(text, MAX_API_BODY_CHARS)

    content_type = response.headers.get("content-type", "")
    if "json" in content_type.lower():
        try:
            return _redact_auth_value(response.json(), auth_value), was_truncated
        except json.JSONDecodeError:
            pass

    return _redact_auth_value(truncated_text, auth_value), was_truncated


def _extract_title(html: str) -> str | None:
    match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return unescape(re.sub(r"\s+", " ", match.group(1))).strip() or None


def _fallback_extract_text(html: str) -> str:
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


async def call_api(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    auth_type: str = "none",
    auth_value: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    safe_url = _validate_outbound_url(url)
    request_headers = _build_request_headers(headers, auth_type, auth_value)
    started_at = time.monotonic()

    logger.info(
        "call_api_request",
        url=safe_url,
        method=method.upper(),
        headers=_sanitize_request_headers(request_headers, auth_value),
    )

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    try:
        assert client is not None
        response = await client.request(
            method.upper(),
            safe_url,
            headers=request_headers,
            content=body,
        )
        parsed_body, body_truncated = _parse_api_body(response, auth_value)
        return {
            "url": safe_url,
            "method": method.upper(),
            "status_code": response.status_code,
            "response_headers": _extract_response_headers(response),
            "body": parsed_body,
            "body_truncated": body_truncated,
            "duration_ms": int((time.monotonic() - started_at) * 1000),
        }
    finally:
        if owns_client and client is not None:
            await client.aclose()


async def web_browse(
    url: str,
    *,
    extract_links: bool = False,
    timeout: float = DEFAULT_BROWSE_TIMEOUT_SECONDS,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    safe_url = _validate_outbound_url(url)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    try:
        assert client is not None
        response = await client.get(
            safe_url,
            headers=_build_request_headers(None, "none", None, browser_like=True),
        )
        html = response.text

        extracted: dict[str, Any] = {}
        text = ""
        if trafilatura is not None:
            extracted_raw = trafilatura.extract(
                html,
                output_format="json",
                include_links=extract_links,
                with_metadata=True,
            )
            if extracted_raw:
                extracted = json.loads(extracted_raw)
                text = (extracted.get("text") or "").strip()

        if not text:
            text = _fallback_extract_text(html)

        main_text, truncated = _truncate_text(text, MAX_BROWSE_TEXT_CHARS)
        result: dict[str, Any] = {
            "url": safe_url,
            "final_url": str(response.url),
            "status_code": response.status_code,
            "title": extracted.get("title") or _extract_title(html),
            "author": extracted.get("author"),
            "date": extracted.get("date"),
            "main_text": main_text,
            "text_truncated": truncated,
            "word_count": len(main_text.split()) if main_text else 0,
        }

        if extract_links:
            parser = _LinkExtractor()
            parser.feed(html)
            result["links"] = parser.links

        return result
    finally:
        if owns_client and client is not None:
            await client.aclose()
