from typing import Any


def extract_message_files(attachments: Any) -> list[dict[str, Any]] | None:
    if not isinstance(attachments, list):
        return None

    for attachment in attachments:
        if isinstance(attachment, dict) and attachment.get("type") == "files":
            files = attachment.get("files")
            return files if isinstance(files, list) else None

    return None
