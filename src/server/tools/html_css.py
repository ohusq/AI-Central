from ..helpers import ddg_search, truncate
from ..helpers import fetch_json as _fetch_json
from .programming_help import _fetch_mdn, _fetch_page_content
from .base import BaseTool


class HtmlCssTool(BaseTool):
    name = "html_css"
    description = "Fetch HTML and CSS documentation from MDN."

    def execute(self, args):
        query = args.get("query", "").strip()
        url = args.get("url", "").strip()
        if not query and not url:
            return "Please provide a CSS property, HTML element, or topic to look up."
        if url:
            content = _fetch_page_content(
                url,
                main_markers=['class="main"', 'id="content"', 'role="main"', "<article"],
                trim_after="See also",
            )
            if content:
                return truncate(content, 5000)
            return "Could not fetch URL: " + url
        mdn_topic = query
        if not any(x in query.lower() for x in ["css", "html"]):
            is_css = any(
                x in query.lower()
                for x in [
                    "color", "margin", "padding", "flex", "grid", "display",
                    "position", "background", "border", "width", "height",
                    "font", "text-", "transform", "transition", "animation",
                    "box-shadow", "z-index", "overflow", "opacity",
                ]
            )
            mdn_topic = ("css: " if is_css else "html: ") + query
        mdn_results = _fetch_mdn(mdn_topic)
        if mdn_results:
            lines = mdn_results.split("\n\n")
            result_lines = []
            for l in lines[:3]:
                result_lines.append(l)
            return truncate(
                "MDN results for '" + query + "':\n\n" + "\n\n".join(result_lines),
                5000,
            )
        ddg = ddg_search(query + " MDN web docs")
        if ddg:
            lines = [f"{t}\n{s}\n{u}" for t, u, s in ddg]
            return truncate(
                'Search results for "' + query + '":\n\n' + "\n\n".join(lines), 5000
            )
        return 'No results found for "' + query + '".'
