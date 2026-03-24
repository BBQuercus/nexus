import json
import unittest

import httpx

from backend.services.web import UnsafeUrlError, call_api, web_browse


class WebToolsTests(unittest.IsolatedAsyncioTestCase):
    async def test_call_api_parses_json_and_redacts_auth_value(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.headers["Authorization"], "Bearer secret-token")
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"ok": True, "echo": "secret-token"},
            )

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            result = await call_api(
                "https://example.com/data",
                method="GET",
                auth_type="bearer",
                auth_value="secret-token",
                client=client,
            )
        finally:
            await client.aclose()

        self.assertEqual(result["status_code"], 200)
        self.assertEqual(result["body"], {"ok": True, "echo": "[REDACTED]"})

    async def test_call_api_blocks_private_ips(self):
        with self.assertRaises(UnsafeUrlError):
            await call_api("http://127.0.0.1:8000/health")

    async def test_web_browse_extracts_text_and_links_without_trafilatura(self):
        html = """
        <html>
          <head><title>Example Article</title></head>
          <body>
            <main>
              <h1>Example Article</h1>
              <p>Useful content for the model.</p>
              <a href="https://example.com/next">next</a>
            </main>
          </body>
        </html>
        """

        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertIn("Mozilla/5.0", request.headers["User-Agent"])
            return httpx.Response(
                200,
                headers={"content-type": "text/html; charset=utf-8"},
                text=html,
            )

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            result = await web_browse(
                "https://example.com/article",
                extract_links=True,
                client=client,
            )
        finally:
            await client.aclose()

        self.assertEqual(result["title"], "Example Article")
        self.assertIn("Useful content for the model.", result["main_text"])
        self.assertEqual(result["links"], ["https://example.com/next"])
        self.assertGreater(result["word_count"], 0)


if __name__ == "__main__":
    unittest.main()
