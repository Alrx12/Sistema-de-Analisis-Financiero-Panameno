from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import HasherNotAvailable

from app.core.config import settings


def _build_password_hash() -> PasswordHash | None:
    try:
        return PasswordHash.recommended()
    except HasherNotAvailable:
        return None


password_hash = _build_password_hash()


def _hash_password_fallback(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def _verify_password_fallback(password: str, hashed_password: str) -> bool:
    algorithm, salt, expected_digest = hashed_password.split("$", maxsplit=2)
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return hmac.compare_digest(digest, expected_digest)


def hash_password(password: str) -> str:
    if password_hash is None:
        return _hash_password_fallback(password)
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    if password_hash is None:
        return _verify_password_fallback(password, hashed_password)
    return password_hash.verify(password, hashed_password)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)

    expire = datetime.now(timezone.utc) + expires_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


_RESET_TOKEN_EXPIRE_MINUTES = 15
_RESET_PURPOSE = "password_reset"


def create_password_reset_token(user_id: str) -> str:
    """Genera un JWT de uso único para reset de contraseña. Expira en 15 minutos."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": user_id,
        "exp": expire,
        "purpose": _RESET_PURPOSE,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_password_reset_token(token: str) -> str:
    """
    Valida el reset token y retorna el user_id.
    Lanza ValueError si el token es inválido, expirado o de otro propósito.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except Exception as exc:
        raise ValueError("Token inválido o expirado") from exc

    if payload.get("purpose") != _RESET_PURPOSE:
        raise ValueError("Token no es de reset de contraseña")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Token sin subject")

    return str(user_id)