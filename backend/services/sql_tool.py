import json
import re
from textwrap import dedent


def sanitize_table_name(filename: str) -> str:
    base = filename.rsplit("/", 1)[-1]
    stem = base.rsplit(".", 1)[0]
    sanitized = re.sub(r"[^a-zA-Z0-9_]+", "_", stem).strip("_").lower()
    if not sanitized:
        sanitized = "table"
    if sanitized[0].isdigit():
        sanitized = f"t_{sanitized}"
    return sanitized


def build_run_sql_script(sql: str, output_format: str = "table") -> str:
    sql_json = json.dumps(sql)
    output_json = json.dumps(output_format)

    return dedent(
        f"""
        import json
        import os
        import re
        import subprocess
        import sys
        from pathlib import Path

        try:
            import duckdb
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "duckdb"])
            import duckdb

        import pandas as pd

        ROOT = Path("/home/daytona")
        SQL = {sql_json}
        OUTPUT_FORMAT = {output_json}

        def sanitize_table_name(filename: str) -> str:
            stem = Path(filename).stem
            sanitized = re.sub(r"[^a-zA-Z0-9_]+", "_", stem).strip("_").lower()
            if not sanitized:
                sanitized = "table"
            if sanitized[0].isdigit():
                sanitized = f"t_{{sanitized}}"
            return sanitized

        conn = duckdb.connect()
        registered = []
        file_patterns = ("*.csv", "*.parquet", "*.xlsx")

        for pattern in file_patterns:
            for path in ROOT.rglob(pattern):
                if "output" in path.parts:
                    continue
                table_name = sanitize_table_name(path.name)
                suffix = path.suffix.lower()
                if suffix == ".csv":
                    df = pd.read_csv(path)
                elif suffix == ".parquet":
                    df = pd.read_parquet(path)
                elif suffix == ".xlsx":
                    df = pd.read_excel(path)
                else:
                    continue
                conn.register(table_name, df)
                registered.append({{"table": table_name, "path": str(path), "columns": list(df.columns)}})

        if not registered:
            print("No CSV, Parquet, or Excel files found in /home/daytona")
            raise SystemExit(1)

        try:
            result = conn.execute(SQL).fetchdf()
        except Exception as exc:
            print(f"SQL query failed: {{exc}}")
            print("\\nAvailable tables:")
            for item in registered:
                cols = ", ".join(item["columns"])
                print(f"- {{item['table']}} -> {{item['path']}}")
                print(f"  columns: {{cols}}")
            raise SystemExit(1)

        if OUTPUT_FORMAT == "json":
            print(result.to_json(orient="records"))
        elif OUTPUT_FORMAT == "csv":
            print(result.to_csv(index=False))
        else:
            print(result.to_markdown(index=False))
        """
    ).strip()
