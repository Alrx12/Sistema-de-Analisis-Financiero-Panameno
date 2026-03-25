import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.limiter import limiter

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse
from app.services.email_service import send_reset_email

logger = logging.getLogger(__name__)

router = APIRouter()


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
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == form_data.username))
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=str(user.user_id))
    return TokenResponse(access_token=token)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    """
    Solicita un reset de contraseña.

    Busca el email en la DB y genera un token firmado válido por 15 minutos.

    - En desarrollo (DEBUG=true): devuelve el token en la respuesta para pruebas.
    - En producción: el token se enviaría por email y la respuesta no lo expone.

    Siempre responde con HTTP 200 aunque el email no exista (evita enumeración de usuarios).
    """
    _GENERIC_MSG = "Si el email está registrado, recibirás las instrucciones de reset."

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        # Respuesta genérica para no revelar si el email existe
        return ForgotPasswordResponse(message=_GENERIC_MSG)

    reset_token = create_password_reset_token(str(user.user_id))
    logger.info("Reset token generado para user_id=%s", user.user_id)

    if settings.debug:
        # En desarrollo: log del token y se devuelve en la respuesta para facilitar pruebas.
        # En producción esta rama nunca se ejecuta.
        logger.debug("DEBUG reset_token=%s", reset_token)
        return ForgotPasswordResponse(message=_GENERIC_MSG, reset_token=reset_token)

    # Producción: enviar email y NUNCA exponer el token en la respuesta
    try:
        send_reset_email(to_email=user.email, reset_token=reset_token)
    except Exception:
        # Loguea el error pero responde genéricamente — nunca revelar si el email existe
        logger.exception("Error enviando email de reset para user_id=%s", user.user_id)

    return ForgotPasswordResponse(message=_GENERIC_MSG)


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Resetea la contraseña usando el token recibido en /forgot-password.

    El token expira en 15 minutos. Una vez usada la nueva contraseña
    el token queda implícitamente inválido porque el hash cambió.
    """
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
    """
    Cambia la contraseña del usuario autenticado.
    Requiere la contraseña actual como verificación.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
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
