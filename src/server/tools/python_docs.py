import re

from ..helpers import (
    fetch,
    fetch_json,
    clean_html,
    ddg_search,
    truncate,
)
from .base import BaseTool


def _searchindex_lookup(query):
    try:
        data = fetch_json("https://docs.python.org/3/searchindex.json")
    except Exception:
        return None
    terms = data.get("terms", {})
    docnames = data.get("docnames", [])
    filenames = data.get("filenames", [])
    words = re.sub(r"[^a-zA-Z0-9_]+", " ", query.lower()).strip().split()
    scores = {}
    for word in words:
        if word in terms:
            entry = terms[word]
            if isinstance(entry, dict):
                entries_list = entry
            elif isinstance(entry, list):
                for item in entry:
                    if isinstance(item, int):
                        scores[item] = scores.get(item, 0) + 1
                continue
            else:
                continue
            for doc_idx, count in (
                entries_list.items() if isinstance(entries_list, dict) else entries_list
            ):
                scores[int(doc_idx)] = scores.get(int(doc_idx), 0) + (
                    count if isinstance(count, (int, float)) else 1
                )
    if not scores:
        return None
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    results = []
    seen_urls = set()
    for doc_idx, score in ranked[:5]:
        if doc_idx < len(filenames):
            url = filenames[doc_idx]
            if url.endswith(".html"):
                url = url[:-5]
            if url in seen_urls:
                continue
            seen_urls.add(url)
            name = docnames[doc_idx] if doc_idx < len(docnames) else url
            results.append((url, name, score))
    return results


def _fetch_page(url, query_words=None):
    try:
        html = fetch(url)
    except Exception:
        return None
    for marker in ['role="main"', 'id="body"', 'id="the-python"']:
        idx = html.find(marker)
        if idx >= 0:
            break
    else:
        idx = html.find("<body")
        if idx >= 0:
            idx = html.find(">", idx) + 1
        else:
            idx = 0
    text = clean_html(html[idx: idx + 10000])
    if query_words:
        for word in query_words:
            t_idx = text.lower().find(word.lower())
            if t_idx > 200:
                text = text[max(t_idx - 300, 0): t_idx + 4000]
                break
    return text.strip()


class PythonDocsTool(BaseTool):
    name = "python_docs"
    description = "Fetch Python documentation from docs.python.org."

    def execute(self, args):
        query = args.get("query", "").strip()
        if not query:
            return 'No query provided. Please specify a Python topic (e.g. "list.append").'
        words = re.sub(r"[^a-zA-Z0-9_\.]+", " ", query).split()
        search_term = "site:docs.python.org " + query
        results = ddg_search(search_term, max_results=3)
        if results:
            for title, url, snippet in results:
                if "docs.python.org" in url:
                    content = _fetch_page(url, words)
                    if content and len(content) > 50:
                        return truncate(f"Python docs: {title}\n\n{content}", 6000)
            ddg_text = "\n".join([f"- {t}: {s}" for t, s, _ in results])
            return truncate(
                "Python docs search results:\n"
                + ddg_text
                + "\n\nUse a more specific query to get full documentation."
            )
        module = query.split(".")[0] if "." in query else ""
        if module:
            for form in [module, "lib/" + module]:
                page_url = "https://docs.python.org/3/" + form + ".html"
                content = _fetch_page(page_url, words)
                if content and len(content) > 50:
                    return truncate(f"Python docs: {query}\n\n{content}", 5000)
        return (
            'Could not find Python docs for "' + query + '". Try a more specific query.'
        )
