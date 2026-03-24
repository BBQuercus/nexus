import csv
import io
import re


def detect_table(output: str) -> list[list[str]] | None:
    """Simple heuristic to detect tabular output."""
    lines = output.strip().split("\n")
    if len(lines) < 3:
        return None

    pipe_lines = [line for line in lines if "|" in line]
    if len(pipe_lines) >= 3:
        rows = []
        for line in pipe_lines:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if all(set(cell.strip()) <= {"-", ":", " "} for cell in cells):
                continue
            rows.append(cells)
        if len(rows) >= 2:
            return rows

    non_empty = [line for line in lines if line.strip()]
    if len(non_empty) >= 3:
        split_counts = [len(re.split(r"\s{2,}", line.strip())) for line in non_empty[:10]]
        if all(count >= 2 for count in split_counts) and max(split_counts) - min(split_counts) <= 1:
            return [re.split(r"\s{2,}", line.strip()) for line in non_empty]

    return None


def rows_to_csv(rows: list[list[str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    return buffer.getvalue()
