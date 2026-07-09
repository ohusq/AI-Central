import json
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from .config import BASE_DIR

CREDENTIALS_FILE = BASE_DIR / "tool_data" / "gmail_credentials.enc"


def _derive_key(master_password: str, salt: bytes) -> bytes:
    from base64 import urlsafe_b64encode
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        iterations=600000,
        salt=salt,
        length=32,
    )
    return urlsafe_b64encode(kdf.derive(master_password.encode()))


def encrypt_credentials(email: str, app_password: str, master_password: str) -> None:
    salt = os.urandom(16)
    key = _derive_key(master_password, salt)
    f = Fernet(key)
    payload = json.dumps({"email": email, "app_password": app_password}).encode()
    token = f.encrypt(payload)
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_FILE.write_bytes(salt + token)


def decrypt_credentials(master_password: str) -> dict:
    data = CREDENTIALS_FILE.read_bytes()
    salt = data[:16]
    token = data[16:]
    key = _derive_key(master_password, salt)
    f = Fernet(key)
    decrypted = f.decrypt(token)
    return json.loads(decrypted.decode())


def has_credentials() -> bool:
    return CREDENTIALS_FILE.exists()


def clear_credentials() -> None:
    if CREDENTIALS_FILE.exists():
        CREDENTIALS_FILE.unlink()


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return ""
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"{local}*@{domain}"
    return f"{local[0]}{'*' * (len(local) - 1)}@{domain}"
