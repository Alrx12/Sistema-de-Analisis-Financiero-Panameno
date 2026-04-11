"""remove_rls_force

Quita FORCE ROW LEVEL SECURITY de todas las tablas.

PROBLEMA QUE RESUELVE:
  La migración r8s5t3u2v1w0 habilitó FORCE ROW LEVEL SECURITY en la tabla
  `users` (y otras tablas). Esto rompe el login porque:
    1. Al hacer login NO hay JWT todavía → rls_context_middleware no puede
       setear app.current_user_id en el ContextVar.
    2. El event listener _set_rls_user_context ve user_id=None y no llama
       set_config() → app.current_user_id queda vacío en la sesión PostgreSQL.
    3. La política RLS evalúa: user_id = NULLIF('', '') = NULL → siempre FALSE.
    4. La query SELECT * FROM users WHERE email=... devuelve 0 filas.
    5. El usuario ve "Credenciales incorrectas" aunque las credenciales sean correctas.
  OAuth falla exactamente por la misma razón: el callback busca al usuario por
  social_id sin JWT → RLS bloquea todas las filas.

SOLUCIÓN:
  Quitamos FORCE de todas las tablas. ENABLE ROW LEVEL SECURITY sigue activo
  (las políticas existen y están listas). Como el usuario de DB 'apineda' es
  superuser, automáticamente bypasea RLS (sin FORCE). Las políticas entrarán
  en vigor cuando se cree el rol restringido safpro_app (ver CLAUDE.md § RLS).

Revision ID: s9t6u4v3w2x1
Revises: r8s5t3u2v1w0
Create Date: 2026-04-11
"""

from alembic import op
from sqlalchemy import text

revision = "s9t6u4v3w2x1"
down_revision = "r8s5t3u2v1w0"
branch_labels = None
depends_on = None

ALL_RLS_TABLES = [
    "users",
    "analysis_snapshots",
    "processing_jobs",
    "manual_wallets",
    "savings_goals",
    "user_profiles",
    "bank_accounts",
    "analysis_transactions",
    "uploaded_files",
]


def upgrade() -> None:
    """Quita FORCE de todas las tablas con RLS.
    El superuser apineda vuelve a bypassear RLS automáticamente → login funciona.
    Las políticas siguen existiendo para cuando se configure el rol safpro_app.
    """
    conn = op.get_bind()
    for table in ALL_RLS_TABLES:
        conn.execute(text(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY"))


def downgrade() -> None:
    """Re-aplica FORCE (deshacer este fix — no recomendado sin safpro_app role)."""
    conn = op.get_bind()
    for table in ALL_RLS_TABLES:
        conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
