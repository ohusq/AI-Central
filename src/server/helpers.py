import json
import re
from pathlib import Path
from urllib.parse import quote


def clean_html(text):
    text = re.sub(
        r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE
    )
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<nav[^>]*>.*?</nav>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(
        r"</?(?:p|div|h[1-6]|li|br|tr|td|th|blockquote|pre|code|ul|ol|dl|dt|dd|section|article)[^>]*>",
        "\n",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +", " ", text)
    return text.strip()


def ddg_search(query, max_results=5):
    try:
        html = fetch("https://lite.duckduckgo.com/lite/?q=" + quote(query))
    except Exception:
        return None
    results = []
    for m in re.finditer(
        r'<a rel="nofollow" href="([^"]*)"[^>]*>(.*?)</a>', html, re.DOTALL
    ):
        raw_url = m.group(1).strip()
        if "uddg=" in raw_url:
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(raw_url)
            qs = parse_qs(parsed.query)
            url = qs.get("uddg", [raw_url])[0]
        else:
            url = raw_url
        title = clean_html(m.group(2)).strip()
        if title and url and url not in [r[1] for r in results]:
            snippet = ""
            row_match = re.search(
                r"<tr[^>]*>.*?" + re.escape(m.group(0)) + r".*?</tr>", html, re.DOTALL
            )
            if row_match:
                row_text = clean_html(row_match.group(0))
                for line in row_text.split("\n"):
                    if (
                        line.strip()
                        and line.strip() != title
                        and len(line.strip()) > 20
                    ):
                        snippet = line.strip()
                        break
            results.append((title, url, snippet))
            if len(results) >= max_results:
                break
    return results if results else None


def truncate(text, limit=4000):
    if len(text) > limit:
        return text[:limit] + "\n\n[truncated...]"
    return text


def fetch(url, timeout=15):
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "AI-Central/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_json(url, timeout=15):
    return json.loads(fetch(url, timeout))


def lm_studio_request(method, path, body=None, stream=False):
    import urllib.error
    import urllib.request

    from .config import LM_STUDIO_URL

    url = LM_STUDIO_URL + path
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if stream:
        return urllib.request.urlopen(req)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {
            "error": f"LM Studio error: {e.code}",
            "details": e.read().decode("utf-8", errors="replace"),
        }
    except urllib.error.URLError as e:
        return {"error": f"Cannot reach LM Studio at {LM_STUDIO_URL}: {e.reason}"}


def resolve_path(path_str):
    from .config import _USER_FOLDERS, WORKSPACE_DIR

    if path_str.startswith("~"):
        path_str = str(Path.home() / path_str.lstrip("~\\/"))
    user_path = Path(path_str)
    if user_path.is_absolute():
        return user_path.resolve()
    parts = user_path.parts
    if parts and parts[0].lower() in _USER_FOLDERS:
        base = _USER_FOLDERS[parts[0].lower()]
        rest = Path(*parts[1:]) if len(parts) > 1 else Path(".")
        return (base / rest).resolve()
    return (WORKSPACE_DIR / path_str).resolve()
