"""
Servicio de perfil de usuario para SAFPRO.

Gestiona la creación, lectura y actualización del UserProfile.
Patrón get-or-create: si el perfil no existe, lo crea vacío en lugar de lanzar 404.
Esto simplifica el frontend — siempre recibe un objeto válido.
"""
import uuid

from sqlalchemy.orm import Session

from app.models.user_profile import UserProfile
from app.schemas.user_profile import UserProfileUpdate


class ProfileService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create(self, user_id: uuid.UUID) -> UserProfile:
        """
        Retorna el perfil del usuario. Si no existe, crea uno vacío (onboarding_completed=False).
        Nunca lanza 404 — el perfil vacío es un estado válido.
        """
        profile = (
            self.db.query(UserProfile)
            .filter(UserProfile.user_id == user_id)
            .first()
        )
        if profile is None:
            profile = UserProfile(
                profile_id=uuid.uuid4(),
                user_id=user_id,
                industry=None,
                expected_monthly_income=None,
                financial_goals=[],
                onboarding_completed=False,
            )
            self.db.add(profile)
            self.db.commit()
            self.db.refresh(profile)
        return profile

    def update(self, user_id: uuid.UUID, data: UserProfileUpdate) -> UserProfile:
        """
        Actualiza el perfil del usuario. Hace get-or-create si no existe,
        luego aplica los campos del body y persiste.
        """
        profile = self.get_or_create(user_id)

        if data.industry is not None:
            profile.industry = data.industry
        if data.expected_monthly_income is not None:
            profile.expected_monthly_income = data.expected_monthly_income
        # financial_goals y onboarding_completed siempre se actualizan
        profile.financial_goals = data.financial_goals
        profile.onboarding_completed = data.onboarding_completed

        self.db.commit()
        self.db.refresh(profile)
        return profile
