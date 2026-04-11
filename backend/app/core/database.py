from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


# ── Row Level Security — inyección de contexto de usuario ────────────────────
# Se activa al inicio de cada transacción SQLAlchemy.
# Lee el user_id almacenado en el ContextVar (puesto por RLSMiddleware en main.py)
# y llama a set_config(..., true) para que sea LOCAL a la transacción.
# Cuando la transacción termina (commit/rollback) Postgres resetea la variable.
#
# IMPORTANTE: este mecanismo solo tiene efecto si el usuario de DB
# NO tiene BYPASSRLS (los superusers siempre bypassean RLS).
# Ver CLAUDE.md § RLS para pasos de configuración completa.
@event.listens_for(Session, "after_begin")
def _set_rls_user_context(session: Session, transaction, connection) -> None:  # noqa: ANN001
    """Inyecta app.current_user_id en cada transacción para RLS de PostgreSQL."""
    # Import lazy para evitar ciclo circular en startup
    from app.core.request_context import current_user_id_var  # noqa: PLC0415

    user_id = current_user_id_var.get()
    if user_id:
        # set_config(key, value, is_local=true) → resetea al final de la tx
        connection.execute(
            text("SELECT set_config('app.current_user_id', :uid, true)"),
            {"uid": user_id},
        )
