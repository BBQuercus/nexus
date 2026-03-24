import unittest

from backend.services.extraction import extract_artifacts
from backend.services.messages import extract_message_files
from backend.services.tables import detect_table, rows_to_csv


class ArtifactPlumbingTests(unittest.TestCase):
    def test_extract_artifacts_uses_frontend_supported_types(self):
        artifacts = extract_artifacts(
            """```python
def hello():
    return "world"
```""",
            tool_calls=[
                {
                    "function": {
                        "name": "write_file",
                        "arguments": {"path": "/home/daytona/report.pdf", "content": "pdf-bytes"},
                    }
                }
            ],
        )

        self.assertEqual(artifacts[0]["type"], "code")
        self.assertEqual(artifacts[1]["type"], "document")
        self.assertEqual(artifacts[1]["metadata"]["path"], "/home/daytona/report.pdf")

    def test_detected_table_can_be_exported_as_csv(self):
        rows = detect_table(
            "| city | users |\n"
            "| --- | --- |\n"
            "| Zurich | 3 |\n"
            "| Bern | 2 |\n"
        )

        self.assertEqual(rows, [["city", "users"], ["Zurich", "3"], ["Bern", "2"]])
        self.assertEqual(rows_to_csv(rows), "city,users\r\nZurich,3\r\nBern,2\r\n")

    def test_extract_message_files_reads_files_attachment(self):
        attachments = [
            {
                "type": "files",
                "files": [
                    {"filename": "report.csv", "fileType": "csv", "sandboxId": "sbx-1"}
                ],
            }
        ]
        self.assertEqual(
            extract_message_files(attachments),
            [{"filename": "report.csv", "fileType": "csv", "sandboxId": "sbx-1"}],
        )


if __name__ == "__main__":
    unittest.main()
