from ..helpers import ddg_search, truncate
from .base import BaseTool


class WindowsSupportTool(BaseTool):
    name = "windows_support"
    description = "Search Microsoft documentation and support articles."

    def execute(self, args):
        query = args.get("query", "").strip()
        if not query:
            return "No query provided. Please specify a Windows topic."
        import requests

        params = {"search": query, "scope": "Windows", "locale": "en-us", "$top": "5"}
        try:
            resp = requests.get(
                "https://learn.microsoft.com/api/search",
                params=params,
                headers={"User-Agent": "AI-Central/1.0"},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
            else:
                data = {}
        except Exception:
            data = {}
        results = data.get("results") or []
        if not results:
            ddg = ddg_search(
                query + " site:learn.microsoft.com OR site:support.microsoft.com Windows"
            )
            if ddg:
                lines = [f"{t}\n{s}\n{u}" for t, u, s in ddg]
                return truncate(
                    'Windows search results for "' + query + '":\n\n' + "\n\n".join(lines)
                )
            return "No results from Microsoft Learn."
        lines = []
        for r in results[:5]:
            title = r.get("title", "Untitled")
            snippet = r.get("description", "") or ""
            url = r.get("url", "")
            lines.append(f"{title}\n{snippet}\n{url}")
        return truncate(
            'Microsoft Learn results for "' + query + '":\n\n' + "\n\n".join(lines)
        )
