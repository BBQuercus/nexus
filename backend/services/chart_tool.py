import json
from typing import Any

_VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json"

# All valid top-level Vega-Lite composition keys
_VALID_SPEC_KEYS = {"mark", "layer", "hconcat", "vconcat", "concat", "facet", "repeat", "spec"}


def normalize_chart_spec(spec: Any) -> dict[str, Any]:
    # LLMs sometimes JSON-stringify the spec instead of passing an object
    if isinstance(spec, str):
        try:
            spec = json.loads(spec)
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError("Chart spec must be a valid JSON object") from exc

    if not isinstance(spec, dict):
        raise ValueError("Chart spec must be a JSON object, got: " + type(spec).__name__)

    # Inject schema if missing — vega-embed needs it to detect Vega-Lite vs Vega
    if "$schema" not in spec:
        spec = {"$schema": _VEGA_LITE_SCHEMA, **spec}

    if not any(k in spec for k in _VALID_SPEC_KEYS):
        raise ValueError("Chart spec must include one of: mark, layer, hconcat, vconcat, concat, facet, repeat")

    result: dict[str, Any] = spec
    return result
