from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any

import jwt
import pyotp
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


# ── Email verification token ────────────────────────────────────────────────
_EMAIL_VERIFY_EXPIRE_HOURS = 24
_EMAIL_VERIFY_PURPOSE = "email_verification"


def create_email_verification_token(user_id: str) -> str:
    """Genera un JWT para verificar el email del usuario. Expira en 24 horas."""
    expire = datetime.now(timezone.utc) + timedelta(hours=_EMAIL_VERIFY_EXPIRE_HOURS)
    payload: dict[str, Any] = {
        "sub": user_id,
        "exp": expire,
        "purpose": _EMAIL_VERIFY_PURPOSE,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_email_verification_token(token: str) -> str:
    """Valida el token de verificación de email y retorna el user_id."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except Exception as exc:
        raise ValueError("Token inválido o expirado") from exc

    if payload.get("purpose") != _EMAIL_VERIFY_PURPOSE:
        raise ValueError("Token no es de verificación de email")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Token sin subject")

    return str(user_id)


# ── 2FA pending token (login step 1 → step 2) ───────────────────────────────
_TWO_FACTOR_EXPIRE_MINUTES = 5
_TWO_FACTOR_PURPOSE = "two_factor_pending"


def create_two_factor_token(user_id: str) -> str:
    """JWT de corta duración (5 min) que identifica el paso pendiente de 2FA durante el login."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=_TWO_FACTOR_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": user_id,
        "exp": expire,
        "purpose": _TWO_FACTOR_PURPOSE,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_two_factor_token(token: str) -> str:
    """Valida el 2FA pending token y retorna el user_id."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except Exception as exc:
        raise ValueError("Token inválido o expirado") from exc

    if payload.get("purpose") != _TWO_FACTOR_PURPOSE:
        raise ValueError("Token no es de 2FA pendiente")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Token sin subject")

    return str(user_id)


# ── OAuth state token (CSRF protection) ────────────────────────────────────
_OAUTH_STATE_EXPIRE_MINUTES = 10
_OAUTH_STATE_PURPOSE = "oauth_state"


def create_oauth_state(provider: str, mobile: bool = False) -> str:
    """Genera un JWT firmado como parámetro state para OAuth (protección CSRF).

    Si mobile=True, el callback redirigirá al scheme nativo safpro:// en lugar
    del frontend web, para que expo-web-browser capture el resultado.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=_OAUTH_STATE_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "exp": expire,
        "purpose": _OAUTH_STATE_PURPOSE,
        "provider": provider,
        "nonce": secrets.token_hex(8),
        "mobile": mobile,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def verify_oauth_state(state: str, expected_provider: str) -> bool:
    """Verifica que el state de OAuth sea válido y del proveedor correcto."""
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=[settings.algorithm])
        return (
            payload.get("purpose") == _OAUTH_STATE_PURPOSE
            and payload.get("provider") == expected_provider
        )
    except Exception:
        return False


def is_mobile_oauth_state(state: str) -> bool:
    """Retorna True si el state fue creado para el flujo OAuth mobile (app nativa)."""
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=[settings.algorithm])
        return bool(payload.get("mobile", False))
    except Exception:
        return False


# ── TOTP (2FA) helpers ───────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    """Genera un secreto TOTP aleatorio en base32."""
    return pyotp.random_base32()


def get_totp_provisioning_uri(secret: str, email: str) -> str:
    """Retorna el URI otpauth:// para registrar en apps como Google Authenticator."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="SAFPRO")


def verify_totp(secret: str, code: str) -> bool:
    """Verifica un código TOTP de 6 dígitos. Acepta ±1 ventana (30 s de margen)."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)