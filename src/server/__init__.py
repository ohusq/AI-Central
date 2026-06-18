from flask import Flask

from .config import SITE_DIR, WORKSPACE_DIR, LM_STUDIO_URL
from .routes import register_routes


def create_app():
    app = Flask(__name__, static_folder=None)
    register_routes(app)
    return app


def main():
    import webbrowser

    app = create_app()
    port = 8080
    url = f"http://localhost:{port}"
    print(f"AI-Central server running at {url}")
    print(f"Proxying LM Studio at {LM_STUDIO_URL}")
    print(f"Serving static files from {SITE_DIR}")
    print(f"Workspace: {WORKSPACE_DIR}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
