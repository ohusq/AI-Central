import json
import sqlite3
from pathlib import Path

from .base import BaseTool

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "shopify_liquid.db"


def _search(query: str, limit: int = 8) -> list[dict]:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT p.category, p.name AS page, p.url, s.heading, s.content, s.code_examples
            FROM sections s
            JOIN pages p ON s.page_id = p.id
            WHERE s.id IN (
                SELECT rowid FROM sections_fts
                WHERE sections_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            )
            ORDER BY p.category, p.name, s.sort_order
            """,
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


class ShopifyLiquidTool(BaseTool):
    name = "shopify_liquid"
    description = (
        "Search the Shopify Liquid documentation for tags, filters, objects, "
        "and language basics. Use this when the user asks about Shopify theme "
        "development, Liquid syntax, or storefront rendering."
    )

    def execute(self, args):
        query = args.get("query", "").strip()
        if not query:
            return "Please provide a search query (e.g. 'product object', 'color filter', 'for tag')."
        results = _search(query)
        if not results:
            return (
                f'No results found for "{query}". '
                "Try different keywords (e.g. 'money filter' instead of 'currency format')."
            )
        parts = []
        for r in results:
            heading = r["heading"]
            page = r["page"]
            category = r["category"]
            url = r["url"]
            content = r["content"]
            code = r["code_examples"]
            block = f"## {page} ({category}) — {heading}\n\n{content}"
            if code:
                blocks = json.loads(code)
                examples = "\n".join(b.replace("\\n", "\n") for b in blocks)
                block += f"\n\n### Code examples\n\n{examples}"
            block += f"\n\n_Source: {url}_"
            parts.append(block)
        return "\n\n---\n\n".join(parts)
