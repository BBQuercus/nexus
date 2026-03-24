import unittest

from backend.services.chart_tool import normalize_chart_spec


class ChartToolTests(unittest.TestCase):
    def test_normalize_chart_spec_accepts_valid_mark_spec(self):
        spec = normalize_chart_spec({
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "mark": "bar",
            "encoding": {},
        })
        self.assertEqual(spec["mark"], "bar")

    def test_normalize_chart_spec_requires_schema_and_mark_or_layer(self):
        with self.assertRaises(ValueError):
            normalize_chart_spec({"mark": "bar"})
        with self.assertRaises(ValueError):
            normalize_chart_spec({"$schema": "x"})


if __name__ == "__main__":
    unittest.main()
