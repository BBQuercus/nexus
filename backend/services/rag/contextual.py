"""Contextual retrieval prefix generation.

Implements Anthropic's contextual retrieval technique: before embedding each
chunk, prepend 1-2 sentences of LLM-generated context that situates the chunk
within the overall document. Cuts retrieval failures by ~67%.
"""

import openai

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("rag.contextual")

_base_url = settings.LITE_LLM_URL
if not _base_url.endswith("/"):
    _base_url += "/"
_base_url += "v1"

_client = openai.AsyncOpenAI(base_url=_base_url, api_key=settings.LITE_LLM_API_KEY)

_CONTEXT_PROMPT = """Here is a document:
<document>
{doc_text}
</document>

Here is a chunk from that document:
<chunk>
{chunk_text}
</chunk>

Give a short (1-2 sentence) context that situates this chunk within the overall document. \
Mention the document subject and what this specific chunk covers. \
Answer ONLY with the context, nothing else."""

# Truncate document text to keep prompt cheap
_MAX_DOC_CHARS = 15_000


async def generate_context_prefix(
    document_text: str,
    chunk_text: str,
    model: str | None = None,
) -> str:
    """Generate a contextual prefix for a chunk using a cheap/fast LLM."""
    model = model or settings.RAG_CONTEXTUAL_MODEL
    doc_truncated = document_text[:_MAX_DOC_CHARS]

    try:
        response = await _client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": _CONTEXT_PROMPT.format(
                        doc_text=doc_truncated,
                        chunk_text=chunk_text[:2000],
                    ),
                }
            ],
            max_tokens=100,
            temperature=0,
        )
        prefix = (response.choices[0].message.content or "").strip()
        return prefix
    except Exception:
        logger.exception("context_prefix_failed", model=model)
        return ""


async def generate_context_prefixes(
    document_text: str,
    chunk_texts: list[str],
    model: str | None = None,
) -> list[str]:
    """Generate contextual prefixes for multiple chunks.

    Processes sequentially to stay within rate limits on cheap models.
    """
    import asyncio

    # Process in small concurrent batches to balance speed and rate limits
    batch_size = 5
    prefixes: list[str] = []

    for i in range(0, len(chunk_texts), batch_size):
        batch = chunk_texts[i : i + batch_size]
        results = await asyncio.gather(
            *[generate_context_prefix(document_text, text, model) for text in batch],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, BaseException):
                logger.warning("context_prefix_batch_error", error=str(r))
                prefixes.append("")
            else:
                prefixes.append(r)

    logger.info(
        "context_prefixes_generated",
        total=len(chunk_texts),
        successful=sum(1 for p in prefixes if p),
    )
    return prefixes
