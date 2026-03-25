import unittest

from backend.prompts.system import build_system_prompt
from backend.prompts.tools import get_tools_for_mode


class PromptToolingTests(unittest.TestCase):
    def test_chat_mode_now_exposes_full_toolset(self):
        tools = get_tools_for_mode("chat")
        names = {tool["function"]["name"] for tool in tools}

        self.assertIn("execute_code", names)
        self.assertIn("create_chart", names)
        self.assertIn("run_sql", names)
        self.assertIn("call_api", names)
        self.assertIn("web_browse", names)
        self.assertIn("web_search", names)
        self.assertNotIn("knowledge_search", names)

    def test_knowledge_search_is_only_exposed_when_explicitly_enabled(self):
        tools = get_tools_for_mode("chat", has_knowledge=True)
        names = {tool["function"]["name"] for tool in tools}

        self.assertIn("knowledge_search", names)

    def test_system_prompt_lists_available_tools(self):
        tools = get_tools_for_mode("code")
        prompt = build_system_prompt("code", tools=tools)

        self.assertIn("## Available Tools", prompt)
        self.assertIn("`execute_code`", prompt)
        self.assertIn("`create_chart`", prompt)
        self.assertIn("`run_sql`", prompt)
        self.assertIn("`call_api`", prompt)

    def test_system_prompt_only_includes_knowledge_section_when_selected(self):
        prompt = build_system_prompt("chat", has_knowledge=False)

        self.assertNotIn("## Selected Knowledge Base Access", prompt)

    def test_system_prompt_names_selected_knowledge_bases_and_pushes_retrieval(self):
        prompt = build_system_prompt(
            "chat",
            has_knowledge=True,
            selected_knowledge_bases=[{"name": "Product Docs", "description": "API reference"}],
        )

        self.assertIn("## Selected Knowledge Base Access", prompt)
        self.assertIn("Product Docs: API reference", prompt)
        self.assertIn("use `knowledge_search` early instead of guessing", prompt)


if __name__ == "__main__":
    unittest.main()
