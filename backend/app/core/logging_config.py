"""
Configuración de logging para SAFPRO.

Tres destinos:
  - consola     : siempre activo, nivel INFO
  - app.log     : log general de la aplicación, RotatingFileHandler (10 MB × 5)
  - audit.log   : eventos críticos de seguridad/negocio, RotatingFileHandler (10 MB × 10)

Cómo usar el audit logger en cualquier módulo:
    from app.core.logging_config import audit_logger
    audit_logger.info("upload_queued user_id=%s filename=%s", user_id, filename)
"""

import logging
import logging.config
import logging.handlers
from pathlib import Path

from app.core.config import settings


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
                # Formato legible y parseable: timestamp | evento | detalles
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
                "maxBytes": 10 * 1024 * 1024,   # 10 MB por archivo
                "backupCount": 5,
                "encoding": "utf-8",
                "formatter": "standard",
                "level": "INFO",
            },
            "audit_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_dir / "audit.log"),
                "maxBytes": 10 * 1024 * 1024,   # 10 MB por archivo
                "backupCount": 10,               # más copias — son logs de seguridad
                "encoding": "utf-8",
                "formatter": "audit",
                "level": "INFO",
            },
        },
        "loggers": {
            # Audit logger — solo eventos de alto valor
            "safpro.audit": {
                "handlers": ["audit_file", "console"],
                "level": "INFO",
                "propagate": False,
            },
            # Loggers de la app — log general
            "app": {
                "handlers": ["app_file", "console"],
                "level": "INFO",
                "propagate": False,
            },
        },
        "root": {
            # En debug: solo consola. En prod: consola + app.log
            "handlers": ["console"] if settings.debug else ["console", "app_file"],
            "level": "INFO",
        },
    }

    logging.config.dictConfig(log_config)


# Singleton del audit logger — importable directamente
audit_logger = logging.getLogger("safpro.audit")
