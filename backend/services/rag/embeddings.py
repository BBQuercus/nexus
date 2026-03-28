"""Embedding generation via LiteLLM proxy (OpenAI-compatible)."""

from collections.abc import Awaitable, Callable

import openai

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("rag.embeddings")

# Reuse the same LiteLLM proxy as the chat LLM
_base_url = settings.LITE_LLM_URL
if not _base_url.endswith("/"):
    _base_url += "/"
_base_url += "v1"

_client = openai.AsyncOpenAI(base_url=_base_url, api_key=settings.LITE_LLM_API_KEY)

# Max batch size for embedding API calls
_BATCH_SIZE = 100


async def embed_texts(
    texts: list[str],
    model: str | None = None,
    on_batch_complete: Callable[[int], Awaitable[None]] | None = None,
) -> list[list[float]]:
    """Batch-embed texts via LiteLLM proxy.

    Splits into batches of _BATCH_SIZE and returns vectors in the same order.
    on_batch_complete(chunks_done) is called after each batch if provided.
    """
    model = model or settings.EMBEDDING_MODEL
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        try:
            response = await _client.embeddings.create(model=model, input=batch)
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
            if on_batch_complete:
                await on_batch_complete(len(all_embeddings))
        except Exception:
            logger.exception("embedding_batch_failed", model=model, batch_start=i, batch_size=len(batch))
            raise

    logger.info("embeddings_generated", count=len(texts), model=model)
    return all_embeddings


async def embed_query(query: str, model: str | None = None) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([query], model=model)
    return results[0]
