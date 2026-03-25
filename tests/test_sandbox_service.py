import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.services import sandbox as sandbox_service


class SandboxServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_sandbox_uses_modern_daytona_get(self):
        fake_daytona = SimpleNamespace(get=lambda sandbox_id: {"id": sandbox_id})

        with patch.object(sandbox_service, "_get_daytona", return_value=fake_daytona):
            result = await sandbox_service.get_sandbox("sbx-123")

        self.assertEqual(result, {"id": "sbx-123"})

    async def test_get_sandbox_falls_back_to_legacy_lookup(self):
        class LegacyDaytona:
            def get_current_sandbox(self, sandbox_id):
                return {"id": sandbox_id}

        with patch.object(sandbox_service, "_get_daytona", return_value=LegacyDaytona()):
            result = await sandbox_service.get_sandbox("sbx-legacy")

        self.assertEqual(result, {"id": "sbx-legacy"})

    async def test_get_preview_url_prefers_modern_preview_link(self):
        class Sandbox:
            def get_preview_link(self, port):
                return SimpleNamespace(url=f"https://preview.example:{port}")

        url = await sandbox_service.get_preview_url(Sandbox(), 8080)
        self.assertEqual(url, "https://preview.example:8080")

    async def test_get_preview_url_falls_back_to_legacy_method(self):
        class Sandbox:
            def get_preview_url(self, port):
                return f"https://legacy-preview.example:{port}"

        url = await sandbox_service.get_preview_url(Sandbox(), 3000)
        self.assertEqual(url, "https://legacy-preview.example:3000")
