"""Web search via SerpAPI with support for multiple search engines.

Supported engines: google (default), google_news, google_scholar,
google_maps, youtube, google_shopping, bing, duckduckgo.
"""

from typing import Any

import httpx

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("search")

# Each engine returns results in a different shape. These extractors
# normalise the SerpAPI response into a consistent list of dicts.

_SERPAPI_URL = "https://serpapi.com/search.json"


def _extract_google(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {"title": r.get("title", ""), "url": r.get("link", ""), "snippet": r.get("snippet", "")}
        for r in data.get("organic_results", [])[:n]
    ]


def _extract_google_news(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "source": r.get("source", {}).get("name", ""),
            "date": r.get("date", ""),
        }
        for r in data.get("news_results", [])[:n]
    ]


def _extract_google_scholar(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "authors": ", ".join(a.get("name", "") for a in r.get("publication_info", {}).get("authors", [])),
            "year": r.get("publication_info", {}).get("summary", ""),
            "cited_by": r.get("inline_links", {}).get("cited_by", {}).get("total", 0),
        }
        for r in data.get("organic_results", [])[:n]
    ]


def _extract_youtube(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("description", ""),
            "channel": r.get("channel", {}).get("name", ""),
            "views": r.get("views", 0),
            "length": r.get("length", ""),
            "published_date": r.get("published_date", ""),
        }
        for r in data.get("video_results", [])[:n]
    ]


def _extract_google_maps(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("link", "") or r.get("place_id_search", ""),
            "address": r.get("address", ""),
            "rating": r.get("rating", None),
            "reviews": r.get("reviews", 0),
            "type": r.get("type", ""),
            "phone": r.get("phone", ""),
        }
        for r in data.get("local_results", [])[:n]
    ]


def _extract_google_shopping(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "price": r.get("price", ""),
            "source": r.get("source", ""),
            "rating": r.get("rating", None),
            "snippet": r.get("snippet", r.get("title", "")),
        }
        for r in data.get("shopping_results", [])[:n]
    ]


def _extract_bing(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {"title": r.get("title", ""), "url": r.get("link", ""), "snippet": r.get("snippet", "")}
        for r in data.get("organic_results", [])[:n]
    ]


def _extract_duckduckgo(data: dict, n: int) -> list[dict[str, Any]]:
    return [
        {"title": r.get("title", ""), "url": r.get("link", ""), "snippet": r.get("snippet", "")}
        for r in data.get("organic_results", [])[:n]
    ]


ENGINES: dict[str, dict[str, Any]] = {
    "google": {"engine": "google", "query_param": "q", "extractor": _extract_google},
    "google_news": {"engine": "google_news", "query_param": "q", "extractor": _extract_google_news},
    "google_scholar": {"engine": "google_scholar", "query_param": "q", "extractor": _extract_google_scholar},
    "google_maps": {"engine": "google_maps", "query_param": "q", "extractor": _extract_google_maps},
    "youtube": {"engine": "youtube", "query_param": "search_query", "extractor": _extract_youtube},
    "google_shopping": {"engine": "google_shopping", "query_param": "q", "extractor": _extract_google_shopping},
    "bing": {"engine": "bing", "query_param": "q", "extractor": _extract_bing},
    "duckduckgo": {"engine": "duckduckgo", "query_param": "q", "extractor": _extract_duckduckgo},
}

AVAILABLE_ENGINES = sorted(ENGINES.keys())


async def web_search(query: str, num_results: int = 5, engine: str = "google") -> list[dict[str, Any]]:
    """Search the web using SerpAPI.

    Args:
        query: The search query.
        num_results: Maximum number of results to return.
        engine: SerpAPI engine to use (google, google_news, google_scholar,
                google_maps, youtube, google_shopping, bing, duckduckgo).

    Returns empty list if SerpAPI is not configured or the request fails.
    """
    if not settings.SERPAPI_API_KEY:
        return []

    engine_config = ENGINES.get(engine)
    if not engine_config:
        logger.warning("unknown_search_engine", engine=engine, available=AVAILABLE_ENGINES)
        engine_config = ENGINES["google"]

    try:
        params: dict[str, Any] = {
            engine_config["query_param"]: query,
            "api_key": settings.SERPAPI_API_KEY,
            "engine": engine_config["engine"],
        }
        # num param only applies to engines that support it
        if engine in ("google", "bing", "duckduckgo", "google_shopping"):
            params["num"] = num_results

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(_SERPAPI_URL, params=params)
            response.raise_for_status()
            data = response.json()

        extractor = engine_config["extractor"]
        results: list[dict[str, Any]] = extractor(data, num_results)
        return results
    except Exception as e:
        logger.warning("web_search_failed", engine=engine, query=query[:100], error=str(e))
        return []
