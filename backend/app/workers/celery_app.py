"""
Celery application instance para SAFPRO.

Configuración:
  - Broker  : Redis (REDIS_URL del .env)
  - Backend : Redis (para inspección de tareas via CLI; la fuente de verdad es PostgreSQL)
  - acks_late=True: el mensaje se ack solo cuando la tarea termina → sin pérdidas si el worker muere
  - task_track_started=True: permite saber cuándo una tarea empezó

Pool por plataforma:
  - Windows: "solo" (ejecución en el proceso principal, sin forking).
             El pool prefork falla en Windows con Python ≥ 3.12 por restricciones de semáforos.
  - Linux/macOS: "prefork" (default de Celery, mejor throughput en producción).

Iniciar worker:
  cd backend/
  # Linux/macOS
  celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
  # Windows
  celery -A app.workers.celery_app worker --loglevel=info --pool=solo
"""
import sys

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "safpro",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

_base_conf = dict(
    # Serialización
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Zonas horarias
    timezone="UTC",
    enable_utc=True,

    # Confiabilidad
    task_acks_late=True,              # ack después de completar, no al recibir
    task_reject_on_worker_lost=True,  # re-encola si el worker muere sin ack

    # Tracking
    task_track_started=True,

    # TTL de resultados en Redis (24 h) — solo para inspección, no es fuente de verdad
    result_expires=86400,

    # Reintentos con backoff exponencial: 30s, 60s, 120s
    task_default_retry_delay=30,
)

if sys.platform == "win32":
    # prefork usa semáforos compartidos que Windows restringe en Python ≥ 3.12
    _base_conf["worker_pool"] = "solo"

celery_app.conf.update(_base_conf)
