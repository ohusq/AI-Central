import json
import os
from pathlib import Path

from flask import jsonify, request, Response, stream_with_context, send_from_directory

from .config import SITE_DIR, WORKSPACE_DIR, LM_STUDIO_URL
from .helpers import lm_studio_request
from .tools import TOOL_EXECUTORS


def register_routes(app):

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
        result = lm_studio_request("GET", "/v1/models")
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
