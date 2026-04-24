"""
Servicio de perfil de usuario para SAFPRO.

Gestiona la creación, lectura y actualización del UserProfile.
Patrón get-or-create: si el perfil no existe, lo crea vacío en lugar de lanzar 404.
Esto simplifica el frontend — siempre recibe un objeto válido.

Historial de cambios:
  Cuando el usuario modifica un campo financiero clave (ingreso, industria,
  mascotas, dependientes, etc.) se registra una fila en profile_change_history
  con el valor anterior y el nuevo. Esto permite saber a partir de qué fecha
  cambió su comportamiento financiero y ajustar recomendaciones/comparativas.
"""
import json
import uuid

from sqlalchemy.orm import Session

from app.models.profile_change_history import ProfileChangeHistory, TRACKED_PROFILE_FIELDS
from app.models.user_profile import UserProfile
from app.schemas.user_profile import UserProfileUpdate


def _serialize(value) -> str | None:
    """Serializa un valor Python a JSON string para almacenar en el historial."""
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _values_differ(old, new) -> bool:
    """
    Compara dos valores de campo para detectar si cambiaron.
    Usa comparación por igualdad estricta con manejo de None.
    Para floats y Decimals, compara con tolerancia de 0.01 para evitar
    ruido de redondeo (e.g., 1500.0 vs 1500.00).
    """
    if old is None and new is None:
        return False
    if old is None or new is None:
        return True
    # Tolerancia para campos numéricos (evita registrar cambio por redondeo de DB)
    try:
        return abs(float(old) - float(new)) >= 0.01
    except (TypeError, ValueError):
        pass
    # Para listas y otros tipos, comparar como JSON serializado
    return _serialize(old) != _serialize(new)


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

    def update(
        self,
        user_id: uuid.UUID,
        data: UserProfileUpdate,
        user_email: str | None = None,
        user_name: str = "",
    ) -> UserProfile:
        """
        Actualiza el perfil del usuario. Hace get-or-create si no existe,
        luego aplica solo los campos explícitamente enviados en el body (exclude_unset).

        Esto permite que distintas partes del frontend actualicen subconjuntos
        del perfil sin pisar los campos que no enviaron (e.g., AccountPage
        actualiza campos extendidos sin borrar manual_expenses, y BudgetPage
        actualiza manual_expenses sin borrar los campos extendidos).

        Para cada campo financiero clave que cambia:
          - Registra una fila en profile_change_history con el valor anterior y el nuevo.
          - Envía un email de confirmación al usuario (fire-and-forget) si user_email está disponible.
        """
        profile = self.get_or_create(user_id)

        updates = data.model_dump(exclude_unset=True)

        # Detectar y registrar cambios en campos financieros clave ANTES de aplicarlos
        change_records: list[ProfileChangeHistory] = []
        email_changes: list[dict] = []

        for field, new_value in updates.items():
            if field not in TRACKED_PROFILE_FIELDS:
                continue
            old_value = getattr(profile, field, None)
            if _values_differ(old_value, new_value):
                change_records.append(
                    ProfileChangeHistory(
                        change_id=uuid.uuid4(),
                        user_id=user_id,
                        field_name=field,
                        old_value=_serialize(old_value),
                        new_value=_serialize(new_value),
                    )
                )
                email_changes.append({
                    "field_name": field,
                    "old_value": _serialize(old_value),
                    "new_value": _serialize(new_value),
                })

        # Aplicar los cambios al perfil
        for field, value in updates.items():
            setattr(profile, field, value)

        # Persistir perfil + historial en la misma transacción
        if change_records:
            self.db.add_all(change_records)

        self.db.commit()
        self.db.refresh(profile)

        # Notificar al usuario por email (fire-and-forget, fuera del commit)
        if email_changes and user_email:
            try:
                from app.services.email_service import send_profile_changed_email
                send_profile_changed_email(
                    to_email=user_email,
                    full_name=user_name,
                    changes=email_changes,
                )
            except Exception as exc:
                import logging
                logging.getLogger(__name__).error(
                    "No se pudo enviar email de cambio de perfil — user=%s err=%s",
                    user_id, exc,
                )

        return profile

    def get_change_history(
        self,
        user_id: uuid.UUID,
        field_name: str | None = None,
        limit: int = 50,
    ) -> list[ProfileChangeHistory]:
        """
        Retorna el historial de cambios del perfil para el usuario.
        Opcional: filtrar por campo específico (ej: "pets_count").
        Ordenado por changed_at DESC (más reciente primero).
        """
        q = (
            self.db.query(ProfileChangeHistory)
            .filter(ProfileChangeHistory.user_id == user_id)
        )
        if field_name:
            q = q.filter(ProfileChangeHistory.field_name == field_name)
        return q.order_by(ProfileChangeHistory.changed_at.desc()).limit(limit).all()
