"""enable_rls

Enable Row Level Security on all user-scoped tables in SAFPRO.

Políticas creadas:
  - Cada tabla con user_id solo permite SELECT/INSERT/UPDATE/DELETE
    cuando app.current_user_id (variable de sesión Postgres) coincide
    con el user_id de la fila.
  - El event listener en database.py inyecta esta variable al inicio
    de cada transacción usando el ContextVar puesto por RLSMiddleware.

IMPORTANTE — ¿Cuándo tiene efecto real?
  Por defecto el usuario de DB apineda puede ser superuser → BYPASSRLS
  automático. Para enforcement completo:
    1. Crear un rol sin BYPASSRLS:
         CREATE ROLE safpro_app LOGIN PASSWORD 'xxx' NOSUPERUSER NOCREATEDB NOCREATEROLE;
         GRANT CONNECT ON DATABASE safpro TO safpro_app;
         GRANT USAGE ON SCHEMA public TO safpro_app;
         GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO safpro_app;
         GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO safpro_app;
    2. Cambiar DATABASE_URL en .env al nuevo usuario safpro_app.
    3. Para migraciones y Celery usar el usuario apineda (superuser) con
       una segunda URL: ADMIN_DATABASE_URL=postgresql+psycopg://apineda:xxx@.../safpro
  Hasta entonces las políticas están listas pero un superuser las ignora.

Revision ID: r8s5t3u2v1w0
Revises: q7l4m2n1o0p9
Create Date: 2026-04-11
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "r8s5t3u2v1w0"
down_revision = "q7l4m2n1o0p9"
branch_labels = None
depends_on = None

# Tablas con user_id directo
USER_ID_TABLES = [
    "analysis_snapshots",
    "processing_jobs",
    "manual_wallets",
    "savings_goals",
    "user_profiles",
    "bank_accounts",
]

# analysis_transactions tiene user_id heredado via snapshot, pero
# tiene su propio user_id implícito en la relación. Lo aseguramos
# a través de una política via subquery al snapshot.
# Por simplicidad también agregamos RLS directo si la tabla tiene user_id.


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Tablas con user_id directo ────────────────────────────────────────
    for table in USER_ID_TABLES:
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"
            )
        )
        # FORCE para que aplique también al owner de la tabla
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"
            )
        )
        # Política principal: user_id debe coincidir con la variable de sesión
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(f"""
                CREATE POLICY safpro_user_isolation ON {table}
                    USING (
                        user_id::text = NULLIF(
                            current_setting('app.current_user_id', true), ''
                        )
                    )
                    WITH CHECK (
                        user_id::text = NULLIF(
                            current_setting('app.current_user_id', true), ''
                        )
                    )
            """)
        )

    # ── 2. analysis_transactions — user_id via snapshot ──────────────────────
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE analysis_transactions ENABLE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE analysis_transactions FORCE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text("""
            CREATE POLICY safpro_user_isolation ON analysis_transactions
                USING (
                    EXISTS (
                        SELECT 1 FROM analysis_snapshots s
                        WHERE s.snapshot_id = analysis_transactions.snapshot_id
                          AND s.user_id::text = NULLIF(
                              current_setting('app.current_user_id', true), ''
                          )
                    )
                )
        """)
    )

    # ── 3. uploaded_files ─────────────────────────────────────────────────────
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE uploaded_files FORCE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text("""
            CREATE POLICY safpro_user_isolation ON uploaded_files
                USING (
                    user_id::text = NULLIF(
                        current_setting('app.current_user_id', true), ''
                    )
                )
                WITH CHECK (
                    user_id::text = NULLIF(
                        current_setting('app.current_user_id', true), ''
                    )
                )
        """)
    )

    # ── 4. users — solo el propio usuario puede leer/editar su fila ──────────
    # Los admins acceden vía superuser (apineda) que bypasea RLS.
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE users ENABLE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text(
            "ALTER TABLE users FORCE ROW LEVEL SECURITY"
        )
    )
    conn.execute(
        __import__("sqlalchemy", fromlist=["text"]).text("""
            CREATE POLICY safpro_user_isolation ON users
                USING (
                    user_id::text = NULLIF(
                        current_setting('app.current_user_id', true), ''
                    )
                )
                WITH CHECK (
                    user_id::text = NULLIF(
                        current_setting('app.current_user_id', true), ''
                    )
                )
        """)
    )


def downgrade() -> None:
    conn = op.get_bind()

    all_tables = USER_ID_TABLES + [
        "analysis_transactions",
        "uploaded_files",
        "users",
    ]

    for table in all_tables:
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                f"DROP POLICY IF EXISTS safpro_user_isolation ON {table}"
            )
        )
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY"
            )
        )
        conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"
            )
        )
