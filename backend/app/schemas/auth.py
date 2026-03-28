from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Respuesta del login: puede ser token completo o paso 2FA pendiente
class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    requires_2fa: bool = False
    two_factor_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    # En desarrollo se devuelve el token directamente.
    # En producción este campo se omite y el token se envía por email.
    reset_token: str | None = None


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ── Email verification ───────────────────────────────────────────────────────
class VerifyEmailRequest(BaseModel):
    token: str


# ── 2FA ─────────────────────────────────────────────────────────────────────
class TwoFactorVerifyRequest(BaseModel):
    """Envía el código TOTP junto con el token temporal del paso 1 del login."""
    two_factor_token: str
    code: str = Field(min_length=6, max_length=6)


class TwoFactorSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TwoFactorEnableRequest(BaseModel):
    """Verifica el primer código TOTP para activar 2FA."""
    code: str = Field(min_length=6, max_length=6)


class TwoFactorDisableRequest(BaseModel):
    """Requiere contraseña + código TOTP para desactivar 2FA."""
    password: str
    code: str = Field(min_length=6, max_length=6)