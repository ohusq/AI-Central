from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SITE_DIR = BASE_DIR / "site"
WORKSPACE_DIR = BASE_DIR.parent
LM_STUDIO_URL = "http://localhost:1234"

_USER_FOLDERS = {
    "desktop": Path.home() / "Desktop",
    "documents": Path.home() / "Documents",
    "downloads": Path.home() / "Downloads",
}
