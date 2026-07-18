import email
import imaplib
import re
import smtplib
from email.header import decode_header
from email.mime.text import MIMEText

IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

_HEADER_FIELDS = "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])"


class GmailIMAP:
    def __init__(self, email_address: str, app_password: str):
        self.email_address = email_address
        self.app_password = app_password
        self._conn: imaplib.IMAP4_SSL | None = None

    def connect(self):
        self._conn = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT, timeout=15)
        self._conn.login(self.email_address, self.app_password)

    def disconnect(self):
        if self._conn:
            try:
                self._conn.logout()
            except Exception:
                pass
            self._conn = None

    def _ensure_connected(self):
        if not self._conn:
            self.connect()

    def list_folders(self) -> list[str]:
        self._ensure_connected()
        result, data = self._conn.list()
        folders = []
        for item in data:
            parts = item.decode().split(' "/" ')
            if len(parts) == 2:
                folders.append(parts[1].strip('"'))
        return folders

    def search(
        self, query: str, max_results: int = 10, folder: str = "INBOX"
    ) -> list[dict]:
        self._ensure_connected()
        self._conn.select(folder, readonly=True)

        status, data = self._conn.search(None, "X-GM-RAW", query)
        if status != "OK" or not data[0]:
            return []

        uids = data[0].split()
        uids = uids[-max_results:] if len(uids) > max_results else uids

        results = []
        for uid in uids:
            status, msg_data = self._conn.fetch(
                uid, _HEADER_FIELDS
            )
            if status != "OK":
                continue
            raw_header = msg_data[0][1] if isinstance(msg_data[0], tuple) else b""
            header_msg = email.message_from_bytes(raw_header)

            from_str = self._decode_header_value(header_msg.get("From", ""))
            raw_subject = header_msg.get("Subject", "(no subject)")
            subject = self._decode_header_value(raw_subject)
            date_str = header_msg.get("Date", "")
            message_id = header_msg.get("Message-ID", "").strip("<>")

            results.append({
                "uid": uid.decode() if isinstance(uid, bytes) else uid,
                "from": from_str,
                "subject": subject,
                "date": date_str,
                "message_id": message_id,
            })

        return results

    def read_message(self, uid: str | int, folder: str = "INBOX") -> dict | None:
        self._ensure_connected()
        self._conn.select(folder, readonly=True)

        status, msg_data = self._conn.fetch(str(uid), "(BODY.PEEK[])")
        if status != "OK":
            return None

        raw_email = msg_data[0][1] if isinstance(msg_data[0], tuple) else b""
        msg = email.message_from_bytes(raw_email)

        from_str = self._decode_header_value(msg.get("From", ""))
        subject = self._decode_header_value(msg.get("Subject", "(no subject)"))
        date_str = msg.get("Date", "")
        message_id = msg.get("Message-ID", "").strip("<>")

        body = self._get_email_body(msg)

        return {
            "uid": str(uid),
            "from": from_str,
            "subject": subject,
            "date": date_str,
            "message_id": message_id,
            "body": body,
        }

    def list_unread(self, max_results: int = 10, folder: str = "INBOX") -> list[dict]:
        return self.search("is:unread", max_results, folder)

    @staticmethod
    def _strip_markdown(text: str) -> str:
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        text = re.sub(r"\*(.+?)\*", r"\1", text)
        text = re.sub(r"__([^_]+)__", r"\1", text)
        text = re.sub(r"_([^_]+)_", r"\1", text)
        text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
        text = re.sub(r"#{1,6}\s+", "", text)
        text = re.sub(r">\s", "", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        text = re.sub(r"[-*+]\s", "", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def send_email(self, to_email: str, subject: str, body: str) -> dict:
        body = self._strip_markdown(body)
        msg = MIMEText(body, "plain")
        msg["From"] = self.email_address
        msg["To"] = to_email
        msg["Subject"] = subject

        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
            server.login(self.email_address, self.app_password)
            server.send_message(msg)

        return {"status": "sent", "to": to_email, "subject": subject}

    def reply_email(self, uid: str | int, body: str) -> dict:
        original = self.read_message(uid)
        if not original:
            raise ValueError("Original message not found")

        body = self._strip_markdown(body)
        subject = original["subject"]
        if not subject.lower().startswith("re:"):
            subject = "Re: " + subject

        msg = MIMEText(body, "plain")
        msg["From"] = self.email_address
        msg["To"] = original["from"]
        msg["Subject"] = subject

        if original.get("message_id"):
            msg["In-Reply-To"] = original["message_id"]
            msg["References"] = original["message_id"]

        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
            server.login(self.email_address, self.app_password)
            server.send_message(msg)

        return {"status": "replied", "to": original["from"], "subject": subject}

    @staticmethod
    def _decode_header_value(value: str) -> str:
        if not value:
            return ""
        parts = decode_header(value)
        decoded_parts = []
        for part, charset in parts:
            if isinstance(part, bytes):
                try:
                    decoded_parts.append(
                        part.decode(charset or "utf-8", errors="replace")
                    )
                except (LookupError, UnicodeDecodeError):
                    decoded_parts.append(part.decode("utf-8", errors="replace"))
            else:
                decoded_parts.append(part)
        return " ".join(decoded_parts).strip()

    @staticmethod
    def _get_email_body(msg: email.message.Message) -> str:
        if msg.is_multipart():
            text_parts = []
            for part in msg.walk():
                ctype = part.get_content_type()
                cdisp = str(part.get("Content-Disposition", ""))
                if ctype == "text/plain" and "attachment" not in cdisp:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        try:
                            text_parts.append(payload.decode(charset, errors="replace"))
                        except (LookupError, UnicodeDecodeError):
                            text_parts.append(payload.decode("utf-8", errors="replace"))
                elif ctype == "text/html" and "attachment" not in cdisp:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        try:
                            text_parts.append("[HTML content stripped]")
                        except Exception:
                            pass
            return "\n".join(text_parts).strip() or "(no text content)"
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    return payload.decode(charset, errors="replace").strip()
                except (LookupError, UnicodeDecodeError):
                    return payload.decode("utf-8", errors="replace").strip()
            return "(empty)"
