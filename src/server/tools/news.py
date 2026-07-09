from urllib.parse import quote

from ..helpers import clean_html, ddg_search, fetch
from .base import BaseTool


class NewsTool(BaseTool):
    name = "news"
    description = "Fetch recent news articles about a given subject."

    def execute(self, args):
        query = args.get("query", "").strip()
        max_results = min(int(args.get("max_results", 5)), 10)
        if not query:
            return "No news subject provided. Please specify a topic."
        import xml.etree.ElementTree as ET
        from datetime import datetime

        news_url = "https://news.google.com/rss/search?q=" + quote(query) + "&hl=en-US&gl=US&ceid=US:en"
        try:
            data = fetch(news_url, timeout=10)
            root = ET.fromstring(data)
            items = root.findall(".//item")
            if items:
                results = []
                for item in items[:max_results]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    pub_date = (item.findtext("pubDate") or "").strip()
                    source = (item.findtext("source") or "").strip()
                    desc = clean_html(item.findtext("description") or "")
                    date_str = pub_date
                    if pub_date:
                        try:
                            dt = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                            date_str = dt.strftime("%Y-%m-%d")
                        except Exception:
                            pass
                    line = "• " + title
                    if source:
                        line += " (" + source + ")"
                    line += "\n  " + date_str
                    if desc:
                        line += "\n  " + desc[:250]
                    results.append(line)
                return "News for '" + query + "':\n\n" + "\n\n".join(results)
        except Exception:
            pass
        ddg = ddg_search(query + " news", max_results)
        if ddg:
            lines = ["• " + t + "\n  " + s + "\n  " + u for t, u, s in ddg]
            return "News for '" + query + "':\n\n" + "\n\n".join(lines)
        return 'No news results found for "' + query + '".'
