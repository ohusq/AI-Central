import os

from ..helpers import resolve_path, truncate
from .base import BaseTool


class IoOperationsTool(BaseTool):
    name = "io_operations"
    description = "Read, write, list, or delete files on the local filesystem."

    def execute(self, args):
        action = args.get("action", "").strip()
        path = args.get("path", "").strip()
        content = args.get("content", "")
        if not action:
            return "No action specified. Use read, write, list, or delete."
        if action != "list" and not path:
            return "No path specified."
        if action == "list":
            from ..config import WORKSPACE_DIR

            target = resolve_path(path) if path else WORKSPACE_DIR
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
        safe_path = resolve_path(path)
        if action == "read":
            if not safe_path.is_file():
                return f"File not found: {path}"
            try:
                text = safe_path.read_text("utf-8", errors="replace")
                return truncate(text, 8000)
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
