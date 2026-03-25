import asyncio
import time
from collections.abc import AsyncGenerator
from decimal import Decimal
from typing import Any

import openai

from backend.config import settings
from backend.logging_config import get_logger
from backend.telemetry import (
    errors_total,
    llm_request_duration,
    llm_requests_total,
    llm_time_to_first_token,
)

logger = get_logger("llm")

# OpenAI client pointing to LiteLLM proxy
base_url = settings.LITE_LLM_URL
if not base_url.endswith("/"):
    base_url += "/"
base_url += "v1"

client = openai.AsyncOpenAI(
    base_url=base_url,
    api_key=settings.LITE_LLM_API_KEY,
)

# Approximate pricing per 1M tokens (input, output) in USD
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "azure_ai/claude-sonnet-4-5-swc": (3.0, 15.0),
    "azure_ai/claude-opus-4-5-swc": (15.0, 75.0),
    "azure_ai/claude-opus-4-1-swc": (15.0, 75.0),
    "azure_ai/claude-haiku-4-5-swc": (0.80, 4.0),
    "gpt-4o-swc": (2.50, 10.0),
    "gpt-4o-mini-swc": (0.15, 0.60),
    "gpt-4.1-chn": (2.0, 8.0),
    "gpt-4.1-mini-chn": (0.40, 1.60),
    "gpt-4.1-nano-swc": (0.10, 0.40),
    "gpt-5-gwc": (15.0, 60.0),
    "gpt-5-mini-gwc": (2.0, 8.0),
    "gpt-5-nano-gwc": (0.20, 0.80),
    "gpt-5.1-use2": (15.0, 60.0),
    "gpt-5.2-use2": (15.0, 60.0),
    "o1-gwc": (15.0, 60.0),
    "Llama-3.3-70B-Instruct": (0.50, 0.70),
    "azure_ai/model_router": (0.14, 0.0),
    "azure_ai/gpt-5.3-chat": (15.0, 60.0),
    "azure_ai/gpt-oss-120b": (0.15, 0.60),
    "azure_ai/kimi-k2.5": (0.60, 3.00),
    "azure_ai/deepseek-v3.2": (0.58, 1.68),
    "azure_ai/grok-4-fast-reasoning": (0.20, 0.50),
    "azure_ai/gpt-5.4-mini": (0.75, 4.50),
}

# Retryable HTTP status codes
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
_MAX_RETRIES = 1
_RETRY_BACKOFF_S = 2.0
_MODELS_WITHOUT_TOOL_CHOICE = {
    "azure_ai/model_router",
    "azure_ai/gpt-5.3-chat",
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Calculate cost in USD for a given model and token counts."""
    pricing = MODEL_PRICING.get(model, (1.0, 3.0))
    input_cost = Decimal(str(pricing[0])) * Decimal(str(input_tokens)) / Decimal("1000000")
    output_cost = Decimal(str(pricing[1])) * Decimal(str(output_tokens)) / Decimal("1000000")
    return (input_cost + output_cost).quantize(Decimal("0.000001"))


class LLMUnavailableError(Exception):
    """Raised when the LLM is temporarily unavailable after retries."""

    pass


def _supports_tool_choice(model: str) -> bool:
    return model not in _MODELS_WITHOUT_TOOL_CHOICE


async def stream_chat(
    messages: list[dict],
    model: str,
    tools: list[dict] | None = None,
    temperature: float | None = None,
) -> AsyncGenerator[Any, None]:
    """Async generator yielding chunks from the LLM streaming response.

    Retries once on 429/5xx with backoff before raising LLMUnavailableError.
    """
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if temperature is not None:
        kwargs["temperature"] = max(0.0, min(2.0, temperature))
    if tools:
        kwargs["tools"] = tools
        if _supports_tool_choice(model):
            kwargs["tool_choice"] = "auto"

    last_error: Exception | None = None
    request_start = time.monotonic()
    first_token_emitted = False

    for attempt in range(_MAX_RETRIES + 1):
        try:
            response = await client.chat.completions.create(**kwargs)
            async for chunk in response:
                if not first_token_emitted and chunk.choices:
                    delta = chunk.choices[0].delta
                    if delta.content or (hasattr(delta, "reasoning_content") and delta.reasoning_content):
                        llm_time_to_first_token.labels(model=model).observe(time.monotonic() - request_start)
                        first_token_emitted = True
                yield chunk
            llm_requests_total.labels(model=model, status="success").inc()
            llm_request_duration.labels(model=model).observe(time.monotonic() - request_start)
            return  # Success
        except openai.RateLimitError as e:
            last_error = e
            logger.warning("llm_rate_limited", model=model, attempt=attempt, error=str(e))
            llm_requests_total.labels(model=model, status="rate_limited").inc()
            errors_total.labels(error_type="rate_limited", component="llm").inc()
        except openai.APIStatusError as e:
            if e.status_code in _RETRYABLE_STATUSES:
                last_error = e
                logger.warning("llm_api_error", model=model, status=e.status_code, attempt=attempt)
                llm_requests_total.labels(model=model, status="error").inc()
                errors_total.labels(error_type="api_error", component="llm").inc()
            else:
                llm_requests_total.labels(model=model, status="error").inc()
                errors_total.labels(error_type="api_error", component="llm").inc()
                raise
        except openai.APITimeoutError as e:
            last_error = e
            logger.warning("llm_timeout", model=model, attempt=attempt)
            llm_requests_total.labels(model=model, status="timeout").inc()
            errors_total.labels(error_type="timeout", component="llm").inc()
        except openai.APIConnectionError as e:
            last_error = e
            logger.warning("llm_connection_error", model=model, attempt=attempt, error=str(e))
            llm_requests_total.labels(model=model, status="connection_error").inc()
            errors_total.labels(error_type="connection_error", component="llm").inc()

        if attempt < _MAX_RETRIES:
            await asyncio.sleep(_RETRY_BACKOFF_S * (attempt + 1))

    llm_request_duration.labels(model=model).observe(time.monotonic() - request_start)
    raise LLMUnavailableError(
        f"Model '{model}' is temporarily unavailable. Please try again or switch to a different model. "
        f"(Last error: {last_error})"
    )


async def generate_title(user_message: str, assistant_response: str, model: str | None = None) -> str:
    """Generate a 4-6 word conversation title."""
    # Try multiple models in order of preference
    models_to_try = []
    if model:
        models_to_try.append(model)
    models_to_try.extend(["gpt-4.1-chn", "gpt-5-mini-gwc", "azure_ai/claude-sonnet-4-5-swc"])

    for m in models_to_try:
        try:
            response = await client.chat.completions.create(
                model=m,
                messages=[
                    {
                        "role": "system",
                        "content": "Generate a concise 4-6 word title for this conversation. Return ONLY the title text, nothing else. No quotes, no punctuation at the end.",
                    },
                    {
                        "role": "user",
                        "content": f"User message: {user_message[:500]}\n\nAssistant response: {assistant_response[:500]}",
                    },
                ],
                max_tokens=30,
            )
            title = (response.choices[0].message.content or "").strip().strip("\"'")
            if title:
                return title[:100]
        except Exception:
            continue

    # Fallback: use the first words of the user message
    return user_message[:50] + ("..." if len(user_message) > 50 else "")
