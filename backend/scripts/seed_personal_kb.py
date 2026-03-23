"""
seed_personal_kb.py — Precarga el KB personal de un usuario desde el legacy.

Uso:
    cd backend/
    python scripts/seed_personal_kb.py <user_id>

Ejemplo:
    python scripts/seed_personal_kb.py a1b2c3d4-e5f6-7890-abcd-ef1234567890

El script:
  1. Busca el UUID del usuario en la DB si no se provee.
  2. Copia el KB legacy (knowledge_base_alexis_pineda.json) a
     storage/knowledge_bases/knowledge_base_user_<uuid>.json
  3. No sobreescribe si el archivo destino ya existe (usa --force para forzar).
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

LEGACY_KB = Path(__file__).parent.parent / (
    "../ANALITICA DE TRANSACCIONES/knowledge_base_alexis_pineda.json"
)
KB_DIR = Path(__file__).parent.parent / "storage" / "knowledge_bases"


def seed(user_id: str, force: bool = False) -> None:
    if not LEGACY_KB.exists():
        print(f"❌ No se encontró el KB legacy en:\n   {LEGACY_KB.resolve()}")
        sys.exit(1)

    KB_DIR.mkdir(parents=True, exist_ok=True)
    dest = KB_DIR / f"knowledge_base_user_{user_id}.json"

    if dest.exists() and not force:
        with open(dest) as f:
            existing = json.load(f)
        print(
            f"⚠️  El KB personal ya existe para user_id={user_id}\n"
            f"   exact_matches: {len(existing.get('exact_matches', {}))}\n"
            f"   Usa --force para sobreescribir."
        )
        return

    shutil.copy2(LEGACY_KB, dest)

    with open(dest) as f:
        data = json.load(f)

    print(f"✅ KB personal precargado para user_id={user_id}")
    print(f"   Destino : {dest}")
    print(f"   exact_matches : {len(data.get('exact_matches', {}))}")
    print(f"   patrones      : {len(data.get('patterns', {}))}")
    print(f"   correcciones  : {data.get('corrections_count', 0)}")


def find_user_id_by_email(email: str) -> str | None:
    """Busca el UUID en la DB usando la DATABASE_URL del .env."""
    try:
        import os
        from dotenv import load_dotenv

        load_dotenv(Path(__file__).parent.parent / ".env")
        db_url = os.getenv("DATABASE_URL", "")
        if not db_url:
            return None

        # Compatibilidad psycopg2: reemplazar postgresql+psycopg -> postgresql
        db_url_pg2 = db_url.replace("postgresql+psycopg://", "postgresql://")

        import psycopg2
        conn = psycopg2.connect(db_url_pg2)
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        conn.close()
        return str(row[0]) if row else None
    except Exception as exc:
        print(f"⚠️  No se pudo consultar la DB: {exc}")
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Precarga el KB personal legacy de Alexis Pineda.")
    parser.add_argument(
        "user_id",
        nargs="?",
        help="UUID del usuario. Si se omite, se busca por email alexis12pineda@gmail.com",
    )
    parser.add_argument("--force", action="store_true", help="Sobreescribir si ya existe.")
    args = parser.parse_args()

    uid = args.user_id

    if not uid:
        print("🔍 Buscando UUID para alexis12pineda@gmail.com...")
        uid = find_user_id_by_email("alexis12pineda@gmail.com")
        if uid:
            print(f"   UUID encontrado: {uid}")
        else:
            print("❌ No se pudo obtener el UUID automáticamente.")
            print("   Ejecuta manualmente:")
            print("     python scripts/seed_personal_kb.py <tu-uuid>")
            sys.exit(1)

    seed(uid, force=args.force)
