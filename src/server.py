import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import quote, urljoin
from http.client import HTTPConnection

from flask import (
    Flask,
    jsonify,
    request,
    Response,
    stream_with_context,
    send_from_directory,
)

app = Flask(__name__, static_folder=None)
BASE_DIR = Path(__file__).resolve().parent
SITE_DIR = BASE_DIR / "site"
WORKSPACE_DIR = BASE_DIR.parent
LM_STUDIO_URL = "http://localhost:1234"

# --------------- helpers ---------------


def _clean_html(text):
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


def _ddg_search(query, max_results=5):
    try:
        html = _fetch("https://lite.duckduckgo.com/lite/?q=" + quote(query))
    except Exception:
        return None
    results = []
    for m in re.finditer(
        r'<a rel="nofollow" href="([^"]*)"[^>]*>(.*?)</a>', html, re.DOTALL
    ):
        raw_url = m.group(1).strip()
        if "uddg=" in raw_url:
            from urllib.parse import unquote, parse_qs, urlparse

            parsed = urlparse(raw_url)
            qs = parse_qs(parsed.query)
            url = qs.get("uddg", [raw_url])[0]
        else:
            url = raw_url
        title = _clean_html(m.group(2)).strip()
        if title and url and url not in [r[1] for r in results]:
            snippet = ""
            # Find surrounding table row for snippet
            row_match = re.search(
                r"<tr[^>]*>.*?" + re.escape(m.group(0)) + r".*?</tr>", html, re.DOTALL
            )
            if row_match:
                row_text = _clean_html(row_match.group(0))
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


def _truncate(text, limit=4000):
    if len(text) > limit:
        return text[:limit] + "\n\n[truncated...]"
    return text


def _fetch(url, timeout=15):
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "AI-Central/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _fetch_json(url, timeout=15):
    return json.loads(_fetch(url, timeout))


def _lm_studio_request(method, path, body=None, stream=False):
    import urllib.request
    import urllib.error

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


# --------------- tool implementations ---------------


def tool_weather(args):
    location = args.get("location", "")
    url = "https://wttr.in/" + quote(location) + "?format=j1"
    data = _fetch_json(url)
    cur = (data.get("current_condition") or [None])[0]
    area = (data.get("nearest_area") or [None])[0]
    if not cur:
        return "No weather data available."
    condition = (cur.get("weatherDesc") or [{}])[0].get("value", "unknown")
    temp = cur.get("temp_C", "?")
    feels = cur.get("FeelsLikeC", "?")
    humidity = cur.get("humidity", "?")
    wind = cur.get("windspeedKmph", "?")
    city = (area.get("areaName") or [{}])[0].get("value", "") if area else ""
    region = (area.get("region") or [{}])[0].get("value", "") if area else ""
    loc_parts = [p for p in [city, region] if p]
    location_str = ", ".join(loc_parts) if loc_parts else "your area"
    return (
        f"Weather in {location_str}: {condition}, {temp}°C "
        f"(feels like {feels}°C). Humidity: {humidity}%. Wind: {wind} km/h."
    )


def tool_cppreference(args):
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
            html = _fetch(u)
            title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
            title = title_match.group(1) if title_match else query
            idx = html.find('role="main"')
            if idx < 0:
                idx = html.find('id="content"')
            if idx < 0:
                idx = html.find('class="mw-parser-output"')
            if idx >= 0:
                text = _clean_html(html[idx : idx + 8000])
                text = re.sub(r"^.*?Contents\s*", "", text, flags=re.DOTALL)
                idx2 = text.rfind("Navigation")
                if idx2 >= 0:
                    text = text[:idx2]
                return _truncate(f"Reference: {title}\n\n{text}", 5000)
            text = _clean_html(html)
            text = (
                text[text.find(clean[:15]) :]
                if clean[:15] in text
                else text[text.lower().find(clean[:15].lower()) :]
            )
            idx2 = text.rfind("\n\n\n")
            if idx2 >= 0:
                text = text[:idx2]
            return _truncate(f"Reference: {title}\n\n{text}", 5000)
        except Exception:
            continue
    search_url = "https://en.cppreference.com/w/index.php?search=" + quote(query)
    try:
        html = _fetch(search_url)
        text = _clean_html(html)
        if "searchresults" in html.lower() or "Search results" in text:
            idx = text.find("Search results")
            if idx >= 0:
                text = text[idx:]
            lines = [
                l
                for l in text.split("\n")
                if l.strip() and len(l.strip()) > 15 and not l.strip().startswith("[")
            ]
            return _truncate(
                'Search results for "' + query + '":\n' + "\n".join(lines[:15])
            )
        return _truncate('cppreference results for "' + query + '":\n' + text[:3000])
    except Exception as e:
        return "Could not reach cppreference: " + str(e)


def _python_searchindex_lookup(query):
    try:
        data = _fetch_json("https://docs.python.org/3/searchindex.json")
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


def _fetch_python_page(url, query_words=None):
    try:
        html = _fetch(url)
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
    text = _clean_html(html[idx : idx + 10000])
    if query_words:
        for word in query_words:
            t_idx = text.lower().find(word.lower())
            if t_idx > 200:
                text = text[max(t_idx - 300, 0) : t_idx + 4000]
                break
    return text.strip()


def tool_python_docs(args):
    query = args.get("query", "").strip()
    if not query:
        return 'No query provided. Please specify a Python topic (e.g. "list.append").'
    words = re.sub(r"[^a-zA-Z0-9_\.]+", " ", query).split()
    search_term = "site:docs.python.org " + query
    results = _ddg_search(search_term, max_results=3)
    if results:
        for title, url, snippet in results:
            if "docs.python.org" in url:
                content = _fetch_python_page(url, words)
                if content and len(content) > 50:
                    return _truncate(f"Python docs: {title}\n\n{content}", 6000)
        ddg_text = "\n".join([f"- {t}: {s}" for t, s, _ in results])
        return _truncate(
            "Python docs search results:\n"
            + ddg_text
            + "\n\nUse a more specific query to get full documentation."
        )
    module = query.split(".")[0] if "." in query else ""
    if module:
        for form in [module, "lib/" + module]:
            page_url = "https://docs.python.org/3/" + form + ".html"
            content = _fetch_python_page(page_url, words)
            if content and len(content) > 50:
                return _truncate(f"Python docs: {query}\n\n{content}", 5000)
    return 'Could not find Python docs for "' + query + '". Try a more specific query.'


def tool_windows_support(args):
    query = args.get("query", "").strip()
    if not query:
        return "No query provided. Please specify a Windows topic."
    import requests as _req

    params = {"search": query, "scope": "Windows", "locale": "en-us", "$top": "5"}
    try:
        resp = _req.get(
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
        ddg = _ddg_search(
            query + " site:learn.microsoft.com OR site:support.microsoft.com Windows"
        )
        if ddg:
            lines = [f"{t}\n{s}\n{u}" for t, u, s in ddg]
            return _truncate(
                'Windows search results for "' + query + '":\n\n' + "\n\n".join(lines)
            )
        return "No results from Microsoft Learn."
    lines = []
    for r in results[:5]:
        title = r.get("title", "Untitled")
        snippet = r.get("description", "") or ""
        url = r.get("url", "")
        lines.append(f"{title}\n{snippet}\n{url}")
    return _truncate(
        'Microsoft Learn results for "' + query + '":\n\n' + "\n\n".join(lines)
    )


def _fetch_mdn(query):
    api_url = (
        "https://developer.mozilla.org/api/v1/search?q="
        + quote(query)
        + "&locale=en-US"
    )
    try:
        data = _fetch_json(api_url)
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
        html = _fetch(url)
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
                text = _clean_html(html[idx : idx + 10000])
                if trim_after:
                    idx2 = text.rfind(trim_after)
                    if idx2 >= 0:
                        text = text[:idx2]
                return text
        return _clean_html(html)[:5000]
    except Exception:
        return None


def tool_programming_help(args):
    query = args.get("query", "").strip()
    language = args.get("language", "").strip().lower()
    doc_url = args.get("url", "").strip()
    if not query and not doc_url:
        return "Please provide a query, a URL, or a language to search documentation."
    if doc_url:
        content = _fetch_page_content(doc_url)
        if content:
            return _truncate(content[:5000])
        return "Could not fetch URL: " + doc_url
    if language in ("javascript", "js", "typescript", "ts", "html", "css"):
        mdn_results = _fetch_mdn(
            query + (" " + language if language in ("js", "ts") else "")
        )
        if mdn_results:
            return _truncate("MDN results:\n\n" + mdn_results)
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
            return _truncate(content[:4000])
        return f"Could not fetch {language} docs."
    ddg = _ddg_search(query + " programming documentation")
    if ddg:
        lines = [f"{t}\n{s}\n{u}" for t, u, s in ddg]
        return _truncate('Search results for "' + query + '":\n\n' + "\n\n".join(lines))
    return 'No search results for "' + query + '".'


_USER_FOLDERS = {
    "desktop": Path.home() / "Desktop",
    "documents": Path.home() / "Documents",
    "downloads": Path.home() / "Downloads",
}


def _resolve_path(path_str):
    """Resolve a user-supplied path to an absolute path.
       - ~/...  → user home directory
       - absolute path  → used as-is
       - Desktop/..., Documents/..., Downloads/...  → real user folder
       - everything else → resolved from WORKSPACE_DIR
    """
    if path_str.startswith("~"):
        path_str = str(Path.home() / path_str.lstrip("~\\/"))
    user_path = Path(path_str)
    if user_path.is_absolute():
        return user_path.resolve()
    # Check if the first component is a well-known user folder
    parts = user_path.parts
    if parts and parts[0].lower() in _USER_FOLDERS:
        base = _USER_FOLDERS[parts[0].lower()]
        rest = Path(*parts[1:]) if len(parts) > 1 else Path(".")
        return (base / rest).resolve()
    return (WORKSPACE_DIR / path_str).resolve()


def tool_io_operations(args):
    action = args.get("action", "").strip()
    path = args.get("path", "").strip()
    content = args.get("content", "")
    if not action:
        return "No action specified. Use read, write, list, or delete."
    if action != "list" and not path:
        return "No path specified."
    if action == "list":
        target = _resolve_path(path) if path else WORKSPACE_DIR
        if not target.exists():
            return f"Path does not exist: {target}"
        if target.is_file():
            return f"{path} is a file ({target.stat().st_size} bytes)"
        entries = sorted(os.listdir(target))
        lines = []
        for e in entries[:50]:
            fp = target / e
            suffix = "/" if fp.is_dir() else ""
            lines.append(e + suffix)
        if len(entries) > 50:
            lines.append(f"... and {len(entries) - 50} more")
        return (
            "Contents of " + (path or ".") + ":\n" + "\n".join(lines)
            if lines
            else "Directory is empty."
        )
    safe_path = _resolve_path(path)
    if action == "read":
        if not safe_path.is_file():
            return f"File not found: {path}"
        try:
            text = safe_path.read_text("utf-8", errors="replace")
            return _truncate(text, 8000)
        except Exception as e:
            return f"Error reading file: {e}"
    elif action == "write":
        safe_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            safe_path.write_text(content, "utf-8")
            return f"Written {len(content)} bytes to {path}"
        except Exception as e:
            return f"Error writing file: {e}"
    elif action == "delete":
        if not safe_path.exists():
            return f"Path not found: {path}"
        try:
            if safe_path.is_file():
                safe_path.unlink()
                return f"Deleted file: {path}"
            else:
                import shutil

                shutil.rmtree(safe_path)
                return f"Deleted directory: {path}"
        except Exception as e:
            return f"Error deleting: {e}"
    else:
        return f"Unknown action: {action}. Use read, write, list, or delete."


TOOL_EXECUTORS = {
    "weather": tool_weather,
    "cppreference": tool_cppreference,
    "python_docs": tool_python_docs,
    "windows_support": tool_windows_support,
    "programming_help": tool_programming_help,
    "io_operations": tool_io_operations,
}

# --------------- routes ---------------


@app.route("/environment", methods=["GET"])
def get_environment():
    home = Path.home()
    return jsonify({
        "os": "Windows",
        "username": os.environ.get("USERNAME", ""),
        "home": str(home),
        "desktop": str(home / "Desktop"),
        "documents": str(home / "Documents"),
        "downloads": str(home / "Downloads"),
        "workspace": str(WORKSPACE_DIR),
    })


@app.route("/")
def serve_index():
    return send_from_directory(SITE_DIR, "index.html")


@app.route("/favicon.ico")
def serve_favicon():
    return send_from_directory(SITE_DIR, "favicon.ico")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(SITE_DIR, filename)


@app.route("/v1/models", methods=["GET"])
def list_models():
    result = _lm_studio_request("GET", "/v1/models")
    if "error" in result and not isinstance(result, list):
        return jsonify(result), 503
    return jsonify(result)


@app.route("/v1/chat/completions", methods=["POST"])
def chat_completions():
    body = request.get_json(silent=True) or {}
    is_stream = body.get("stream", False)
    timeout = 120
    import urllib.request
    import urllib.error

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        LM_STUDIO_URL + "/v1/chat/completions", data=data, method="POST"
    )
    req.add_header("Content-Type", "application/json")
    if is_stream:

        def generate():
            try:
                resp = urllib.request.urlopen(req, timeout=timeout)
                while True:
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    yield chunk
            except urllib.error.HTTPError as e:
                error_body = e.read().decode("utf-8", errors="replace")
                yield f"data: {json.dumps({'error': {'message': f'LM Studio error: {e.code}', 'details': error_body}})}\n\n".encode(
                    "utf-8"
                )
            except urllib.error.URLError as e:
                yield f"data: {json.dumps({'error': {'message': f'Cannot reach LM Studio: {e.reason}'}})}\n\n".encode(
                    "utf-8"
                )
            except Exception as e:
                yield f"data: {json.dumps({'error': {'message': str(e)}})}\n\n".encode(
                    "utf-8"
                )

        return Response(
            stream_with_context(generate()), content_type="text/event-stream"
        )
    else:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read().decode("utf-8")
                return Response(data, content_type="application/json")
        except urllib.error.HTTPError as e:
            return jsonify(
                {
                    "error": f"LM Studio error: {e.code}",
                    "details": e.read().decode("utf-8", errors="replace"),
                }
            ), e.code
        except urllib.error.URLError as e:
            return jsonify({"error": f"Cannot reach LM Studio: {e.reason}"}), 503
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/tools/execute", methods=["POST"])
def execute_tool():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "")
    args = data.get("args", {})
    if name not in TOOL_EXECUTORS:
        return jsonify({"error": f"Unknown tool: {name}"}), 400
    if name == "io_operations":
        granted = data.get("permission_granted", False)
        if not granted:
            return jsonify(
                {
                    "error": "Permission denied. User must grant permission on the frontend first."
                }
            ), 403
    try:
        result = TOOL_EXECUTORS[name](args)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --------------- entry ---------------


def main():
    import webbrowser

    port = 8080
    url = f"http://localhost:{port}"
    print(f"AI-Central server running at {url}")
    print(f"Proxying LM Studio at {LM_STUDIO_URL}")
    print(f"Serving static files from {SITE_DIR}")
    print(f"Workspace: {WORKSPACE_DIR}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
