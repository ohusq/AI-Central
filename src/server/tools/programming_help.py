from urllib.parse import quote

from ..helpers import fetch, fetch_json, clean_html, ddg_search, truncate
from .base import BaseTool


def _fetch_mdn(query):
    api_url = (
        "https://developer.mozilla.org/api/v1/search?q="
        + quote(query)
        + "&locale=en-US"
    )
    try:
        data = fetch_json(api_url)
        docs = data.get("documents", [])
        if docs:
            lines = []
            for d in docs[:5]:
                title = d.get("title", "")
                summary = d.get("summary", "") or ""
                url = d.get("mdn_url", "")
                lines.append(f"{title}\n{summary}\nhttps://developer.mozilla.org{url}")
            return "\n\n".join(lines)
    except Exception:
        pass
    return None


def _fetch_page_content(url, main_markers=None, trim_after=None):
    try:
        html = fetch(url)
        markers = main_markers or [
            'role="main"',
            'id="content"',
            'id="body"',
            "<main",
            'class="content"',
        ]
        for m in markers:
            idx = html.find(m)
            if idx >= 0:
                if m.startswith("<"):
                    idx = html.find(">", idx) + 1 if ">" in html[idx:] else idx
                text = clean_html(html[idx: idx + 10000])
                if trim_after:
                    idx2 = text.rfind(trim_after)
                    if idx2 >= 0:
                        text = text[:idx2]
                return text
        return clean_html(html)[:5000]
    except Exception:
        return None


class ProgrammingHelpTool(BaseTool):
    name = "programming_help"
    description = "Fetch programming documentation for any language/platform."

    def execute(self, args):
        query = args.get("query", "").strip()
        language = args.get("language", "").strip().lower()
        doc_url = args.get("url", "").strip()
        if not query and not doc_url:
            return "Please provide a query, a URL, or a language to search documentation."
        if doc_url:
            content = _fetch_page_content(doc_url)
            if content:
                return truncate(content[:5000])
            return "Could not fetch URL: " + doc_url
        if language in ("javascript", "js", "typescript", "ts", "html", "css"):
            mdn_results = _fetch_mdn(
                query + (" " + language if language in ("js", "ts") else "")
            )
            if mdn_results:
                return truncate("MDN results:\n\n" + mdn_results)
        if language in ("rust", "rs"):
            url = "https://doc.rust-lang.org/std/index.html?search=" + quote(query)
        elif language in ("go", "golang"):
            url = "https://pkg.go.dev/search?q=" + quote(query)
        elif language in ("csharp", "c#", "dotnet", ".net"):
            url = "https://learn.microsoft.com/en-us/dotnet/api/?term=" + quote(query)
        elif language in ("cpp", "c++"):
            url = "https://en.cppreference.com/w/index.php?search=" + quote(query)
        elif language in ("java",):
            url = (
                "https://docs.oracle.com/en/java/javase/17/docs/api/search.html?q="
                + quote(query)
            )
        else:
            url = None
        if url:
            content = _fetch_page_content(url)
            if content:
                return truncate(content[:4000])
            return f"Could not fetch {language} docs."
        ddg = ddg_search(query + " programming documentation")
        if ddg:
            lines = [f"{t}\n{s}\n{u}" for t, u, s in ddg]
            return truncate(
                'Search results for "' + query + '":\n\n' + "\n\n".join(lines)
            )
        return 'No search results for "' + query + '".'
