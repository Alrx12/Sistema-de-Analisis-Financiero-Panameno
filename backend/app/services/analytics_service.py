"""
analytics_service.py — Tracking de eventos de producto y estadísticas de KB.

Diseñado como fire-and-forget: nunca lanza excepciones al caller.
Abre su propia sesión de DB para garantizar que el evento se registra
aunque la transacción principal del caller haga rollback.

Eventos disponibles:
  login               — login exitoso con contraseña o OAuth
  upload_queued       — archivo encolado correctamente en Celery
  job_success         — worker Celery terminó el pipeline con éxito
  job_error           — worker Celery falló el pipeline
  learn_transaction   — usuario corrigió una categorización (/learn o /review-groups/apply)

Helpers adicionales:
  upsert_kb_user_stats() — actualiza analytics.kb_user_stats tras cada /learn
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
            # Columnas reales de analytics.product_events:
            #   event_name  (TEXT NOT NULL)  ← el parámetro se llama event_type en Python por legibilidad
            #   properties  (JSONB NOT NULL DEFAULT '{}')  ← el parámetro se llama metadata en Python
            db.execute(
                text("""
                    INSERT INTO analytics.product_events (user_id, event_name, plan, properties)
                    VALUES (:user_id, :event_name, :plan, CAST(:properties AS jsonb))
                """),
                {
                    "user_id": str(user_id),
                    "event_name": event_type,
                    "plan": plan,
                    "properties": json.dumps(metadata) if metadata is not None else "{}",
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


def upsert_kb_user_stats(
    user_id: UUID | str,
    personal_exact_matches: int,
    personal_patterns: int,
    global_contributions_delta: int = 0,
) -> None:
    """
    Hace upsert en analytics.kb_user_stats con el estado actual del KB del usuario.

    Llamar después de cada invocación exitosa de FinancialClassifier.learn().
    Fire-and-forget: nunca lanza excepción al caller.

    Args:
        user_id                   : UUID del usuario
        personal_exact_matches    : nº de exact_matches en su KB personal
        personal_patterns         : nº de patrones en su KB personal
        global_contributions_delta: 1 si el learn fue al KB global, 0 si fue al personal
    """
    try:
        from app.core.database import SessionLocal

        db = SessionLocal()
        try:
            personal_total = personal_exact_matches + personal_patterns
            db.execute(
                text("""
                    INSERT INTO analytics.kb_user_stats (
                        user_id,
                        personal_exact_matches,
                        personal_patterns,
                        personal_total_entries,
                        global_contributions_count,
                        learn_events_count,
                        first_learn_at,
                        last_learn_at,
                        source,
                        measured_at,
                        updated_at
                    )
                    VALUES (
                        :user_id,
                        :personal_exact_matches,
                        :personal_patterns,
                        :personal_total,
                        :global_contributions_delta,
                        1,
                        NOW(),
                        NOW(),
                        'realtime',
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (user_id) DO UPDATE SET
                        personal_exact_matches    = EXCLUDED.personal_exact_matches,
                        personal_patterns         = EXCLUDED.personal_patterns,
                        personal_total_entries    = EXCLUDED.personal_total_entries,
                        global_contributions_count = analytics.kb_user_stats.global_contributions_count
                                                    + :global_contributions_delta,
                        learn_events_count        = analytics.kb_user_stats.learn_events_count + 1,
                        first_learn_at            = COALESCE(analytics.kb_user_stats.first_learn_at, NOW()),
                        last_learn_at             = NOW(),
                        source                    = 'realtime',
                        measured_at               = NOW(),
                        updated_at                = NOW()
                """),
                {
                    "user_id": str(user_id),
                    "personal_exact_matches": personal_exact_matches,
                    "personal_patterns": personal_patterns,
                    "personal_total": personal_total,
                    "global_contributions_delta": global_contributions_delta,
                },
            )
            db.commit()
        finally:
            db.close()

    except Exception as exc:
        logger.warning(
            "analytics.upsert_kb_user_stats failed (ignored) — user=%s: %s",
            user_id,
            exc,
        )
