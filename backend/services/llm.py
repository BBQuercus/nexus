from decimal import Decimal
from typing import Any, AsyncGenerator, Optional

import openai

from backend.config import settings

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
    "gpt-5-gwc": (5.0, 20.0),
    "gpt-5-mini-gwc": (1.0, 4.0),
    "gpt-5-nano-gwc": (0.20, 0.80),
    "gpt-5.1-use2": (5.0, 20.0),
    "gpt-5.2-use2": (5.0, 20.0),
    "o1-gwc": (15.0, 60.0),
    "Llama-3.3-70B-Instruct": (0.50, 0.70),
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Calculate cost in USD for a given model and token counts."""
    pricing = MODEL_PRICING.get(model, (1.0, 3.0))
    input_cost = Decimal(str(pricing[0])) * Decimal(str(input_tokens)) / Decimal("1000000")
    output_cost = Decimal(str(pricing[1])) * Decimal(str(output_tokens)) / Decimal("1000000")
    return (input_cost + output_cost).quantize(Decimal("0.000001"))


async def stream_chat(
    messages: list[dict],
    model: str,
    tools: Optional[list[dict]] = None,
) -> AsyncGenerator[Any, None]:
    """Async generator yielding chunks from the LLM streaming response."""
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    response = await client.chat.completions.create(**kwargs)
    async for chunk in response:
        yield chunk


async def generate_title(user_message: str, assistant_response: str) -> str:
    """Generate a 4-6 word conversation title using a cheap model."""
    try:
        response = await client.chat.completions.create(
            model="gpt-4.1-nano-swc",
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise 4-6 word title for this conversation. Return only the title, no quotes or punctuation.",
                },
                {
                    "role": "user",
                    "content": f"User: {user_message[:500]}\n\nAssistant: {assistant_response[:500]}",
                },
            ],
            max_tokens=30,
        )
        title = response.choices[0].message.content.strip().strip('"\'')
        return title[:100]
    except Exception:
        return user_message[:50] + ("..." if len(user_message) > 50 else "")
