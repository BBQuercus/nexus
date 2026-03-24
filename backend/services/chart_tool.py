from typing import Any


def normalize_chart_spec(spec: Any) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValueError("Chart spec must be a JSON object")
    if "$schema" not in spec:
        raise ValueError("Chart spec must include $schema")
    if "mark" not in spec and "layer" not in spec:
        raise ValueError("Chart spec must include mark or layer")
    return spec
