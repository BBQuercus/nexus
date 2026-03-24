import unittest

from backend.services.sql_tool import build_run_sql_script, sanitize_table_name


class SqlToolTests(unittest.TestCase):
    def test_sanitize_table_name_handles_spaces_and_leading_digits(self):
        self.assertEqual(sanitize_table_name("2024 Sales Report.csv"), "t_2024_sales_report")
        self.assertEqual(sanitize_table_name("/home/daytona/Team-Metrics.parquet"), "team_metrics")

    def test_build_run_sql_script_includes_registration_and_output_modes(self):
        script = build_run_sql_script("select * from sales", "json")

        self.assertIn('SQL = "select * from sales"', script)
        self.assertIn('OUTPUT_FORMAT = "json"', script)
        self.assertIn('for pattern in file_patterns:', script)
        self.assertIn('conn.register(table_name, df)', script)
        self.assertIn('print(result.to_json(orient="records"))', script)
        self.assertIn('print("\\nAvailable tables:")', script)


if __name__ == "__main__":
    unittest.main()
