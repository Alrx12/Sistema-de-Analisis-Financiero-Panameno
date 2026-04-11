"""
Configuración de logging para SAFPRO.

Destinos:
  - consola       : siempre activo, nivel INFO
  - app.log       : log general, RotatingFileHandler (10 MB × 5)
  - audit.log     : eventos críticos de seguridad/negocio (10 MB × 10)
  - BetterStack   : log management en la nube (si BETTERSTACK_SOURCE_TOKEN está configurado)

Cómo usar el audit logger en cualquier módulo:
    from app.core.logging_config import audit_logger
    audit_logger.info("upload_queued user_id=%s filename=%s", user_id, filename)
"""

import logging
import logging.config
import logging.handlers
from pathlib import Path
from typing import Optional

from app.core.config import settings


def _make_betterstack_handler() -> Optional[logging.Handler]:
    """
    Crea un LogtailHandler de BetterStack si el token está configurado.
    BetterStack (ex Logtail) recibe logs en tiempo real y los indexa para búsqueda.
    Obtener token en: betterstack.com → Logs → Sources → Connect source → Python
    """
    if not settings.betterstack_source_token:
        return None

    try:
        from logtail import LogtailHandler  # noqa: PLC0415

        handler = LogtailHandler(source_token=settings.betterstack_source_token)
        handler.setLevel(logging.INFO)
        return handler
    except ImportError:
        logging.warning(
            "logtail-python no instalado. Instala con: pip install logtail-python. "
            "BetterStack desactivado."
        )
        return None


def setup_logging() -> None:
    """Inicializa el sistema de logging. Llamar una sola vez en el startup de FastAPI."""
    log_dir = Path("storage/logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
            "audit": {
                "format": "%(asctime)s | AUDIT | %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "level": "INFO",
                "stream": "ext://sys.stdout",
            },
            "app_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_dir / "app.log"),
                "maxBytes": 10 * 1024 * 1024,
                "backupCount": 5,
                "encoding": "utf-8",
                "formatter": "standard",
                "level": "INFO",
            },
            "audit_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_dir / "audit.log"),
                "maxBytes": 10 * 1024 * 1024,
                "backupCount": 10,
                "encoding": "utf-8",
                "formatter": "audit",
                "level": "INFO",
            },
        },
        "loggers": {
            "safpro.audit": {
                "handlers": ["audit_file", "console"],
                "level": "INFO",
                "propagate": False,
            },
            "app": {
                "handlers": ["app_file", "console"],
                "level": "INFO",
                "propagate": False,
            },
        },
        "root": {
            "handlers": ["console"] if settings.debug else ["console", "app_file"],
            "level": "INFO",
        },
    }

    logging.config.dictConfig(log_config)

    # ── BetterStack — añadir handler si está configurado ─────────────────────
    # Se añade después del dictConfig para no complicar la estructura dict.
    bt_handler = _make_betterstack_handler()
    if bt_handler:
        # Aplicar a root logger → todos los módulos envían a BetterStack
        root_logger = logging.getLogger()
        root_logger.addHandler(bt_handler)

        # Audit logger también → eventos críticos siempre en la nube
        audit_log = logging.getLogger("safpro.audit")
        audit_log.addHandler(bt_handler)

        logging.getLogger(__name__).info(
            "BetterStack logging activado (source_token configurado)"
        )


# Singleton del audit logger — importable directamente
audit_logger = logging.getLogger("safpro.audit")
