import re
from urllib.parse import quote

from ..helpers import fetch, clean_html, truncate
from .base import BaseTool


class CppreferenceTool(BaseTool):
    name = "cppreference"
    description = "Fetch C++ reference documentation from cppreference.com."

    def execute(self, args):
        query = args.get("query", "").strip()
        if not query:
            return 'No query provided. Please specify a C++ topic (e.g. "std::vector").'
        clean = query.replace("::", "/").replace(" ", "_")
        slug = clean.lower().replace(" ", "_")
        direct_urls = [
            "https://en.cppreference.com/w/" + quote(slug),
            "https://en.cppreference.com/w/cpp/" + quote(slug),
        ]
        for u in direct_urls:
            try:
                html = fetch(u)
                title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
                title = title_match.group(1) if title_match else query
                for marker in ['role="main"', 'id="content"', 'class="mw-parser-output"']:
                    idx = html.find(marker)
                    if idx >= 0:
                        break
                else:
                    idx = -1
                if idx >= 0:
                    text = clean_html(html[idx : idx + 8000])
                    text = re.sub(r"^.*?Contents\s*", "", text, flags=re.DOTALL)
                    idx2 = text.rfind("Navigation")
                    if idx2 >= 0:
                        text = text[:idx2]
                    return truncate(f"Reference: {title}\n\n{text}", 5000)
                text = clean_html(html)
                text = (
                    text[text.find(clean[:15]):]
                    if clean[:15] in text
                    else text[text.lower().find(clean[:15].lower()):]
                )
                idx2 = text.rfind("\n\n\n")
                if idx2 >= 0:
                    text = text[:idx2]
                return truncate(f"Reference: {title}\n\n{text}", 5000)
            except Exception:
                continue
        search_url = "https://en.cppreference.com/w/index.php?search=" + quote(query)
        try:
            html = fetch(search_url)
            text = clean_html(html)
            if "searchresults" in html.lower() or "Search results" in text:
                idx = text.find("Search results")
                if idx >= 0:
                    text = text[idx:]
                lines = [
                    l
                    for l in text.split("\n")
                    if l.strip() and len(l.strip()) > 15 and not l.strip().startswith("[")
                ]
                return truncate(
                    'Search results for "' + query + '":\n' + "\n".join(lines[:15])
                )
            return truncate('cppreference results for "' + query + '":\n' + text[:3000])
        except Exception as e:
            return "Could not reach cppreference: " + str(e)
