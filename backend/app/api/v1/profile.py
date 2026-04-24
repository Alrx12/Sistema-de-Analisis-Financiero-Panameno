from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user_profile import UserProfileResponse, UserProfileUpdate
from app.services.analytics_service import track_event
from app.services.profile_service import ProfileService

router = APIRouter()


@router.get(
    "/profile",
    response_model=UserProfileResponse,
    summary="Obtener perfil del usuario",
    description=(
        "Retorna el perfil del usuario actual. Si el perfil no existe aún "
        "(usuario nuevo), lo crea automáticamente con valores vacíos. "
        "onboarding_completed=false indica que el flujo de onboarding está pendiente."
    ),
)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    service = ProfileService(db)
    profile = service.get_or_create(current_user.user_id)
    return UserProfileResponse.model_validate(profile)


@router.put(
    "/profile",
    response_model=UserProfileResponse,
    summary="Actualizar perfil del usuario",
    description=(
        "Actualiza industria, ingreso esperado, metas financieras y estado de onboarding. "
        "Si el perfil no existe, lo crea. "
        "Marcar onboarding_completed=true indica que el usuario completó el flujo inicial."
    ),
)
def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    service = ProfileService(db)

    # Detectar si el usuario está completando el onboarding por primera vez
    was_onboarded = False
    if body.onboarding_completed is True:
        current = service.get_or_create(current_user.user_id)
        was_onboarded = bool(current.onboarding_completed)

    profile = service.update(
        user_id=current_user.user_id,
        data=body,
        user_email=current_user.email,
        user_name=current_user.full_name or "",
    )

    # Disparar evento solo en la primera vez (no en llamadas repetidas)
    if body.onboarding_completed is True and not was_onboarded:
        track_event(
            user_id=current_user.user_id,
            event_type="onboarding_completed",
            plan=getattr(current_user, "plan", None),
            metadata={
                "industry": profile.industry,
                "has_income": profile.expected_monthly_income is not None,
            },
        )

    return UserProfileResponse.model_validate(profile)
