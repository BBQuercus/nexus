from typing import Any

import httpx

from backend.config import settings


async def web_search(query: str, num_results: int = 5) -> list[dict[str, Any]]:
    """Search the web using SerpAPI. Returns empty list if not configured."""
    if not settings.SERPAPI_API_KEY:
        return []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "q": query,
                    "api_key": settings.SERPAPI_API_KEY,
                    "engine": "google",
                    "num": num_results,
                },
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("organic_results", [])[:num_results]:
                results.append(
                    {
                        "title": item.get("title", ""),
                        "url": item.get("link", ""),
                        "snippet": item.get("snippet", ""),
                    }
                )
            return results
    except Exception:
        return []
