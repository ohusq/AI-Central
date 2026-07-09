import json
import os
from pathlib import Path

from flask import Response, jsonify, request, send_from_directory, stream_with_context

from .config import LM_STUDIO_URL, SITE_DIR, WORKSPACE_DIR
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
        import urllib.error
        import urllib.request

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

    # ── Gmail API routes ──────────────────────────────────────────────────────

    @app.route("/api/gmail/status", methods=["GET"])
    def gmail_status():
        from .gmail_crypto import has_credentials, mask_email
        from .tools.gmail import get_credentials

        if not has_credentials():
            return jsonify({"connected": False, "email": None, "locked": False})

        cached = get_credentials()
        if cached:
            return jsonify({
                "connected": True,
                "email": mask_email(cached[0]),
                "locked": False,
            })

        return jsonify({"connected": True, "email": None, "locked": True})

    @app.route("/api/gmail/setup", methods=["POST"])
    def gmail_setup():
        data = request.get_json(silent=True) or {}
        email = data.get("email", "").strip()
        app_password = data.get("app_password", "").strip()
        master_password = data.get("master_password", "").strip()

        if not email or not app_password or not master_password:
            return jsonify({"error": "All fields are required"}), 400
        if "@" not in email:
            return jsonify({"error": "Invalid email address"}), 400

        from .gmail_crypto import encrypt_credentials, mask_email
        from .gmail_imap import GmailIMAP

        try:
            test = GmailIMAP(email, app_password)
            test.connect()
            test.disconnect()
        except Exception as e:
            return jsonify({"error": f"Gmail connection failed: {str(e)}"}), 400

        encrypt_credentials(email, app_password, master_password)

        from .tools.gmail import set_credentials
        set_credentials(email, app_password)

        return jsonify({"success": True, "email": mask_email(email)})

    @app.route("/api/gmail/unlock", methods=["POST"])
    def gmail_unlock():
        data = request.get_json(silent=True) or {}
        master_password = data.get("master_password", "").strip()

        if not master_password:
            return jsonify({"error": "Master password is required"}), 400

        from .gmail_crypto import decrypt_credentials, mask_email
        from .tools.gmail import set_credentials

        try:
            creds = decrypt_credentials(master_password)
            set_credentials(creds["email"], creds["app_password"])
            return jsonify({"success": True, "email": mask_email(creds["email"])})
        except Exception:
            return jsonify({"error": "Incorrect master password"}), 403

    @app.route("/api/gmail/disconnect", methods=["POST"])
    def gmail_disconnect():
        from .gmail_crypto import clear_credentials
        from .tools.gmail import clear_credentials_cache

        clear_credentials()
        clear_credentials_cache()
        return jsonify({"success": True})
