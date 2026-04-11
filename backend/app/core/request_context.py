"""
request_context.py — ContextVars de request para SAFPRO.

Almacena el user_id del JWT en un ContextVar por request, de modo que el
event listener de SQLAlchemy pueda inyectarlo en la sesión de DB para
hacer cumplir Row Level Security (RLS).

Uso:
    # Leer desde cualquier módulo durante un request:
    from app.core.request_context import current_user_id_var
    uid = current_user_id_var.get()   # str UUID o None
"""

from contextvars import ContextVar
from typing import Optional

# UUID del usuario autenticado en el request actual.
# Es None para requests sin JWT (público) o Celery tasks.
current_user_id_var: ContextVar[Optional[str]] = ContextVar(
    "current_user_id", default=None
)
