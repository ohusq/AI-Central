import json

from .base import BaseTool

_credentials_cache: tuple[str, str] | None = None


def set_credentials(email: str, app_password: str) -> None:
    global _credentials_cache
    _credentials_cache = (email, app_password)


def get_credentials() -> tuple[str, str] | None:
    return _credentials_cache


def clear_credentials_cache() -> None:
    global _credentials_cache
    _credentials_cache = None


class GmailTool(BaseTool):
    name = "gmail"
    description = (
        "Search and read emails from Gmail. Use for finding verification"
        " codes, checking unread emails, or looking up specific messages."
    )

    def execute(self, args: dict) -> str:
        creds = get_credentials()
        if not creds:
            return '{"error": "Gmail is locked. Open Settings and unlock Gmail first."}'

        action = args.get("action", "")
        email_addr, app_pw = creds

        from ..gmail_imap import GmailIMAP

        gmail = GmailIMAP(email_addr, app_pw)
        try:
            gmail.connect()

            if action == "search_emails":
                query = args.get("query", "")
                max_results = int(args.get("max_results", 10))
                results = gmail.search(query, max_results)
                return json.dumps({"results": results, "count": len(results)})

            elif action == "read_email":
                uid = args.get("uid", "")
                if not uid:
                    return '{"error": "uid is required"}'
                result = gmail.read_message(uid)
                if result:
                    return json.dumps(result)
                return '{"error": "Email not found"}'

            elif action == "list_unread":
                max_results = int(args.get("max_results", 10))
                results = gmail.list_unread(max_results)
                return json.dumps({"results": results, "count": len(results)})

            else:
                return json.dumps({"error": f"Unknown action: {action}"})

        except Exception as e:
            return json.dumps({"error": f"Gmail error: {str(e)}"})
        finally:
            gmail.disconnect()
