#!/usr/bin/env python3
"""
populate_kb_user_stats.py — Backfill de analytics.kb_user_stats.

Lee todos los archivos knowledge_base_user_{uuid}.json del directorio de KBs
y hace upsert masivo en analytics.kb_user_stats con los conteos actuales.

Uso:
    cd backend
    .venv/bin/python scripts/populate_kb_user_stats.py [--dry-run] [--verbose]

Flags:
    --dry-run    Muestra qué se haría sin escribir nada en la DB.
    --verbose    Imprime una línea por cada usuario procesado.

Cuándo correr:
    - Una vez al migrar (para poblar datos históricos).
    - Si se sospecha desincronización entre los JSON y la tabla.
    El hook inline en /learn mantiene la tabla actualizada en tiempo real
    para los eventos futuros.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Asegura que el módulo app esté en el path cuando se ejecuta desde /backend
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402 (import post sys.path fix)

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backfill analytics.kb_user_stats")
    p.add_argument("--dry-run", action="store_true", help="No escribe en la DB")
    p.add_argument("--verbose", action="store_true", help="Muestra detalle por usuario")
    return p.parse_args()


def _load_personal_kb(path: Path) -> dict:
    """Carga el JSON del KB personal y retorna sus secciones."""
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}


def main() -> None:
    args = _parse_args()

    kb_dir = Path(settings.knowledge_bases_dir)
    if not kb_dir.exists():
        print(f"[ERROR] Directorio de KBs no existe: {kb_dir}", file=sys.stderr)
        sys.exit(1)

    # Busca todos los KBs personales: knowledge_base_user_{uuid}.json
    kb_files = sorted(kb_dir.glob("knowledge_base_user_*.json"))
    if not kb_files:
        print(f"[INFO] No se encontraron KBs personales en {kb_dir}")
        return

    print(f"[INFO] Encontrados {len(kb_files)} KBs personales. dry_run={args.dry_run}")

    rows: list[dict] = []
    skipped = 0

    for kb_path in kb_files:
        # Extrae el UUID del nombre de archivo
        stem = kb_path.stem  # knowledge_base_user_{uuid}
        prefix = "knowledge_base_user_"
        if not stem.startswith(prefix):
            skipped += 1
            continue
        user_id = stem[len(prefix):]

        data = _load_personal_kb(kb_path)
        if not data:
            skipped += 1
            if args.verbose:
                print(f"  [SKIP] {kb_path.name} — JSON vacío o inválido")
            continue

        exact_matches = data.get("exact_matches", {})
        patterns      = data.get("patterns", [])

        personal_exact    = len(exact_matches) if isinstance(exact_matches, dict) else 0
        personal_patterns = len(patterns) if isinstance(patterns, list) else 0
        personal_total    = personal_exact + personal_patterns

        rows.append({
            "user_id": user_id,
            "personal_exact_matches": personal_exact,
            "personal_patterns":      personal_patterns,
            "personal_total":         personal_total,
        })

        if args.verbose:
            print(
                f"  [KB] {user_id}: exact={personal_exact}, patterns={personal_patterns}"
            )

    print(f"[INFO] {len(rows)} filas a upsertear, {skipped} archivos omitidos.")

    if args.dry_run:
        print("[DRY-RUN] Sin cambios en la DB.")
        return

    if not rows:
        print("[INFO] Nada que insertar.")
        return

    db = SessionLocal()
    try:
        upserted = 0
        for row in rows:
            db.execute(
                text("""
                    INSERT INTO analytics.kb_user_stats (
                        user_id,
                        personal_exact_matches,
                        personal_patterns,
                        personal_total_entries,
                        global_contributions_count,
                        learn_events_count,
                        source,
                        measured_at,
                        updated_at
                    )
                    VALUES (
                        :user_id,
                        :personal_exact_matches,
                        :personal_patterns,
                        :personal_total,
                        0,
                        0,
                        'backfill',
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (user_id) DO UPDATE SET
                        personal_exact_matches = EXCLUDED.personal_exact_matches,
                        personal_patterns      = EXCLUDED.personal_patterns,
                        personal_total_entries = EXCLUDED.personal_total_entries,
                        source                 = CASE
                                                    WHEN analytics.kb_user_stats.source = 'realtime'
                                                    THEN 'realtime'
                                                    ELSE 'backfill'
                                                 END,
                        measured_at            = NOW(),
                        updated_at             = NOW()
                """),
                row,
            )
            upserted += 1

        db.commit()
        print(f"[OK] {upserted} filas escritas en analytics.kb_user_stats.")

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Rollback — {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
