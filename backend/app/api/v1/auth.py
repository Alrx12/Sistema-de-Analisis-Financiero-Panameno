import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.limiter import limiter

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_email_verification_token,
    create_oauth_state,
    create_password_reset_token,
    create_two_factor_token,
    decode_email_verification_token,
    decode_password_reset_token,
    decode_two_factor_token,
    generate_totp_secret,
    get_totp_provisioning_uri,
    hash_password,
    verify_oauth_state,
    verify_password,
    verify_totp,
)
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    VerifyEmailRequest,
)
from app.schemas.user import UserResponse
from app.services.email_service import send_reset_email, send_verification_email
from app.services.analytics_service import track_event

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Register ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)) -> UserResponse:
    existing_user = db.scalar(
        select(User).where(
            (User.username == payload.username) | (User.email == payload.email)
        )
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username o email ya existe",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Enviar email de confirmación (solo si RESEND_API_KEY está configurado)
    if settings.resend_api_key:
        try:
            verification_token = create_email_verification_token(str(user.user_id))
            send_verification_email(
                to_email=user.email,
                full_name=user.full_name or user.username,
                verification_token=verification_token,
            )
        except Exception:
            # No bloquear el registro si el email falla
            logger.exception("Error enviando email de verificación para user_id=%s", user.user_id)
    else:
        logger.debug(
            "RESEND_API_KEY no configurado — email de verificación omitido para user_id=%s",
            user.user_id,
        )

    return UserResponse.model_validate(user)


# ── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> LoginResponse:
    user = db.scalar(select(User).where(User.email == form_data.username))
    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Si tiene 2FA activado, devolver token temporal en vez del token de acceso
    if user.totp_enabled:
        two_factor_token = create_two_factor_token(str(user.user_id))
        return LoginResponse(requires_2fa=True, two_factor_token=two_factor_token)

    token = create_access_token(subject=str(user.user_id))
    track_event(
        user_id=user.user_id,
        event_type="login",
        plan=getattr(user, "plan", None),
        metadata={"method": "password"},
    )
    return LoginResponse(access_token=token)


# ── Email verification ───────────────────────────────────────────────────────

@router.post("/verify-email", status_code=status.HTTP_200_OK)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    """Marca el email del usuario como verificado usando el token del email de confirmación."""
    try:
        user_id_str = decode_email_verification_token(payload.token)
        user_id = UUID(user_id_str)
    except (ValueError, Exception):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado.",
        )

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado.",
        )

    if user.is_verified:
        return {"message": "El email ya estaba verificado."}

    user.is_verified = True
    db.add(user)
    db.commit()
    logger.info("Email verificado para user_id=%s", user_id)

    return {"message": "Email verificado correctamente."}


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Reenvía el email de verificación al usuario autenticado (si no está verificado)."""
    if current_user.is_verified:
        return {"message": "Tu email ya está verificado."}

    if not settings.resend_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servicio de email no está configurado.",
        )

    try:
        token = create_email_verification_token(str(current_user.user_id))
        send_verification_email(
            to_email=current_user.email,
            full_name=current_user.full_name or current_user.username,
            verification_token=token,
        )
    except Exception:
        logger.exception("Error reenviando verificación para user_id=%s", current_user.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error enviando el email. Intenta de nuevo.",
        )

    return {"message": "Email de verificación reenviado."}


# ── Password reset ───────────────────────────────────────────────────────────

@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    _GENERIC_MSG = "Si el email está registrado, recibirás las instrucciones de reset."

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        return ForgotPasswordResponse(message=_GENERIC_MSG)

    reset_token = create_password_reset_token(str(user.user_id))
    logger.info("Reset token generado para user_id=%s", user.user_id)

    if settings.debug:
        logger.debug("DEBUG reset_token=%s", reset_token)
        return ForgotPasswordResponse(message=_GENERIC_MSG, reset_token=reset_token)

    try:
        send_reset_email(to_email=user.email, reset_token=reset_token)
    except Exception:
        logger.exception("Error enviando email de reset para user_id=%s", user.user_id)

    return ForgotPasswordResponse(message=_GENERIC_MSG)


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> dict:
    try:
        user_id_str = decode_password_reset_token(payload.reset_token)
        user_id = UUID(user_id_str)
    except (ValueError, Exception):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado.",
        )

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado.",
        )

    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    logger.info("Contraseña reseteada para user_id=%s", user_id)

    return {"message": "Contraseña actualizada correctamente."}


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.password_hash or not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta.",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser diferente a la actual.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    logger.info("Contraseña cambiada para user_id=%s", current_user.user_id)

    return {"message": "Contraseña actualizada correctamente."}


# ── 2FA ─────────────────────────────────────────────────────────────────────

@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def setup_2fa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorSetupResponse:
    """
    Genera un secreto TOTP para el usuario. El usuario debe escanearlo con
    su app de autenticación y luego confirmar con /2fa/enable.
    """
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El 2FA ya está activado. Desactívalo primero.",
        )

    secret = generate_totp_secret()
    current_user.totp_secret = secret
    db.add(current_user)
    db.commit()

    provisioning_uri = get_totp_provisioning_uri(secret, current_user.email)
    return TwoFactorSetupResponse(secret=secret, provisioning_uri=provisioning_uri)


@router.post("/2fa/enable", status_code=status.HTTP_200_OK)
def enable_2fa(
    payload: TwoFactorEnableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Activa el 2FA verificando que el usuario haya configurado correctamente su app."""
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El 2FA ya está activado.",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primero llama a /2fa/setup para generar el secreto.",
        )

    if not verify_totp(current_user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto. Verifica tu app de autenticación.",
        )

    current_user.totp_enabled = True
    db.add(current_user)
    db.commit()
    logger.info("2FA activado para user_id=%s", current_user.user_id)

    return {"message": "Autenticación de dos factores activada correctamente."}


@router.post("/2fa/disable", status_code=status.HTTP_200_OK)
def disable_2fa(
    payload: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Desactiva el 2FA. Requiere contraseña + código TOTP actual."""
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El 2FA no está activado.",
        )

    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña incorrecta.",
        )

    if not current_user.totp_secret or not verify_totp(current_user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto.",
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    db.add(current_user)
    db.commit()
    logger.info("2FA desactivado para user_id=%s", current_user.user_id)

    return {"message": "Autenticación de dos factores desactivada."}


@router.post("/2fa/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
def verify_2fa(
    request: Request,
    payload: TwoFactorVerifyRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Paso 2 del login cuando el usuario tiene 2FA activado.
    Recibe el two_factor_token del paso 1 + el código TOTP de 6 dígitos.
    """
    try:
        user_id_str = decode_two_factor_token(payload.two_factor_token)
        user_id = UUID(user_id_str)
    except (ValueError, Exception):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada. Vuelve a iniciar sesión.",
        )

    user = db.get(User, user_id)
    if not user or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no válido.",
        )

    if not verify_totp(user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Código incorrecto. Intenta de nuevo.",
        )

    token = create_access_token(subject=str(user.user_id))
    track_event(
        user_id=user.user_id,
        event_type="login",
        plan=getattr(user, "plan", None),
        metadata={"method": "2fa"},
    )
    return TokenResponse(access_token=token)


# ── OAuth — Google ───────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.get("/google")
def google_login() -> RedirectResponse:
    """Inicia el flujo OAuth con Google. Redirige al usuario a Google."""
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth no está configurado (GOOGLE_CLIENT_ID faltante).",
        )

    state = create_oauth_state("google")
    callback_url = f"{settings.backend_url}/api/v1/auth/google/callback"

    params = (
        f"client_id={settings.google_client_id}"
        f"&redirect_uri={callback_url}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
        f"&access_type=offline"
        f"&prompt=select_account"
    )
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
def google_callback(code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)) -> RedirectResponse:
    """Callback de Google OAuth. Crea o encuentra al usuario y redirige al frontend con el JWT."""
    frontend_callback = f"{settings.frontend_url}/oauth-callback"

    if error or not code or not state:
        return RedirectResponse(url=f"{frontend_callback}?error=oauth_cancelled")

    if not verify_oauth_state(state, "google"):
        return RedirectResponse(url=f"{frontend_callback}?error=invalid_state")

    callback_url = f"{settings.backend_url}/api/v1/auth/google/callback"

    try:
        with httpx.Client() as client:
            # Intercambiar código por access_token
            token_res = client.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": callback_url,
                "grant_type": "authorization_code",
            })
            token_res.raise_for_status()
            google_token = token_res.json()["access_token"]

            # Obtener info del usuario
            user_res = client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {google_token}"})
            user_res.raise_for_status()
            google_user = user_res.json()
    except Exception:
        logger.exception("Error en callback de Google OAuth")
        return RedirectResponse(url=f"{frontend_callback}?error=oauth_error")

    google_id = google_user.get("id") or google_user.get("sub")
    email = google_user.get("email", "")
    full_name = google_user.get("name", "")

    if not google_id or not email:
        return RedirectResponse(url=f"{frontend_callback}?error=missing_profile")

    # Buscar usuario existente por social_id o email
    user = db.scalar(select(User).where(
        (User.social_provider == "google") & (User.social_id == str(google_id))
    ))
    if not user:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            # Vincular cuenta existente al proveedor social
            user.social_provider = "google"
            user.social_id = str(google_id)
            user.is_verified = True
        else:
            # Crear nuevo usuario
            user = User(
                username=email,
                email=email,
                password_hash=None,
                full_name=full_name,
                is_verified=True,
                social_provider="google",
                social_id=str(google_id),
            )
            db.add(user)

        db.commit()
        db.refresh(user)

    token = create_access_token(subject=str(user.user_id))
    track_event(
        user_id=user.user_id,
        event_type="login",
        plan=getattr(user, "plan", None),
        metadata={"method": "oauth_google"},
    )
    return RedirectResponse(url=f"{frontend_callback}?token={token}")


# ── OAuth — GitHub ───────────────────────────────────────────────────────────

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USERINFO_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


@router.get("/github")
def github_login() -> RedirectResponse:
    """Inicia el flujo OAuth con GitHub. Redirige al usuario a GitHub."""
    if not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth no está configurado (GITHUB_CLIENT_ID faltante).",
        )

    state = create_oauth_state("github")
    callback_url = f"{settings.backend_url}/api/v1/auth/github/callback"

    params = (
        f"client_id={settings.github_client_id}"
        f"&redirect_uri={callback_url}"
        f"&scope=user:email"
        f"&state={state}"
    )
    return RedirectResponse(url=f"{GITHUB_AUTH_URL}?{params}")


@router.get("/github/callback")
def github_callback(code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)) -> RedirectResponse:
    """Callback de GitHub OAuth. Crea o encuentra al usuario y redirige al frontend con el JWT."""
    frontend_callback = f"{settings.frontend_url}/oauth-callback"

    if error or not code or not state:
        return RedirectResponse(url=f"{frontend_callback}?error=oauth_cancelled")

    if not verify_oauth_state(state, "github"):
        return RedirectResponse(url=f"{frontend_callback}?error=invalid_state")

    callback_url = f"{settings.backend_url}/api/v1/auth/github/callback"

    try:
        with httpx.Client() as client:
            # Intercambiar código por access_token
            token_res = client.post(
                GITHUB_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "redirect_uri": callback_url,
                },
                headers={"Accept": "application/json"},
            )
            token_res.raise_for_status()
            github_token = token_res.json().get("access_token")
            if not github_token:
                raise ValueError("No access_token en respuesta de GitHub")

            # Obtener info del usuario
            headers = {
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
            }
            user_res = client.get(GITHUB_USERINFO_URL, headers=headers)
            user_res.raise_for_status()
            gh_user = user_res.json()

            # GitHub puede no devolver el email en el perfil — pedirlo explícitamente
            email = gh_user.get("email")
            if not email:
                emails_res = client.get(GITHUB_EMAILS_URL, headers=headers)
                emails_res.raise_for_status()
                for e in emails_res.json():
                    if e.get("primary") and e.get("verified"):
                        email = e["email"]
                        break
    except Exception:
        logger.exception("Error en callback de GitHub OAuth")
        return RedirectResponse(url=f"{frontend_callback}?error=oauth_error")

    github_id = str(gh_user.get("id", ""))
    full_name = gh_user.get("name") or gh_user.get("login", "")

    if not github_id or not email:
        return RedirectResponse(url=f"{frontend_callback}?error=missing_profile")

    # Buscar usuario existente por social_id o email
    user = db.scalar(select(User).where(
        (User.social_provider == "github") & (User.social_id == github_id)
    ))
    if not user:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.social_provider = "github"
            user.social_id = github_id
            user.is_verified = True
        else:
            user = User(
                username=email,
                email=email,
                password_hash=None,
                full_name=full_name,
                is_verified=True,
                social_provider="github",
                social_id=github_id,
            )
            db.add(user)

        db.commit()
        db.refresh(user)

    token = create_access_token(subject=str(user.user_id))
    track_event(
        user_id=user.user_id,
        event_type="login",
        plan=getattr(user, "plan", None),
        metadata={"method": "oauth_github"},
    )
    return RedirectResponse(url=f"{frontend_callback}?token={token}")
