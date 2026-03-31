"""
analytics_service.py — Tracking de eventos de producto a analytics.product_events.

Diseñado como fire-and-forget: nunca lanza excepciones al caller.
Abre su propia sesión de DB para garantizar que el evento se registra
aunque la transacción principal del caller haga rollback.

Eventos disponibles:
  login               — login exitoso con contraseña o OAuth
  upload_queued       — archivo encolado correctamente en Celery
  job_success         — worker Celery terminó el pipeline con éxito
  job_error           — worker Celery falló el pipeline
  learn_transaction   — usuario corrigió una categorización (/learn o /review-groups/apply)
"""
from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text

logger = logging.getLogger(__name__)


def track_event(
    user_id: UUID | str,
    event_type: str,
    plan: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Inserta un evento en analytics.product_events.

    Nunca lanza excepción — todos los errores se loguean y se ignoran
    para que el fallo de analytics no bloquee la operación principal.

    Args:
        user_id    : UUID del usuario (str o UUID)
        event_type : Tipo de evento (ver módulo docstring)
        plan       : Plan del usuario en el momento del evento (snapshot)
        metadata   : Datos adicionales como dict — se serializa a JSONB
    """
    try:
        # Import tardío para evitar circular imports al cargar el módulo
        from app.core.database import SessionLocal

        db = SessionLocal()
        try:
            db.execute(
                text("""
                    INSERT INTO analytics.product_events (user_id, event_type, plan, metadata)
                    VALUES (:user_id, :event_type, :plan, :metadata::jsonb)
                """),
                {
                    "user_id": str(user_id),
                    "event_type": event_type,
                    "plan": plan,
                    "metadata": json.dumps(metadata) if metadata is not None else None,
                },
            )
            db.commit()
        finally:
            db.close()

    except Exception as exc:
        logger.warning(
            "analytics.track_event failed (ignored) — event=%s user=%s: %s",
            event_type,
            user_id,
            exc,
        )
