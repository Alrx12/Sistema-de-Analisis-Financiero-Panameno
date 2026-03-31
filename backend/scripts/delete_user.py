#!/usr/bin/env python
"""
delete_user.py — Eliminación completa de un usuario de SAFPRO.

Uso:
    python scripts/delete_user.py --email usuario@ejemplo.com          # dry-run (solo muestra lo que se borraría)
    python scripts/delete_user.py --email usuario@ejemplo.com --execute # borra de verdad

Qué borra:
    DB (vía CASCADE desde users):
        users → bank_accounts → processing_jobs → analysis_snapshots
             → analysis_transactions → uploaded_files → user_profiles
             → manual_wallets → savings_goals

    Filesystem:
        storage/knowledge_bases/knowledge_base_user_{uuid}.json
        Todos los archivos en storage_path registrados en uploaded_files

Lo que NO borra:
    Entradas en knowledge_base_global.json que el usuario haya aportado
    (son anónimas y mejorar la calidad del servicio para todos los demás usuarios).

Ejecutar desde backend/ con el virtualenv activo:
    cd backend
    python scripts/delete_user.py --email usuario@ejemplo.com
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ── Asegura que el módulo app sea importable desde backend/ ──────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_transaction import AnalysisTransaction
from app.models.bank_account import BankAccount
from app.models.manual_wallet import ManualWallet
from app.models.processing_job import ProcessingJob
from app.models.savings_goal import SavingsGoal
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.models.user_profile import UserProfile


# ── Helpers ──────────────────────────────────────────────────────────────────

def _count(db: Session, model, user_id) -> int:
    return db.query(model).filter(model.user_id == user_id).count()


def _count_transactions(db: Session, user_id) -> int:
    """Las transacciones se filtran por user_id directamente."""
    return db.query(AnalysisTransaction).filter(
        AnalysisTransaction.user_id == user_id
    ).count()


def _get_file_paths(db: Session, user_id) -> list[str]:
    """Rutas físicas de los archivos subidos por el usuario."""
    rows = db.query(UploadedFile.storage_path).filter(
        UploadedFile.user_id == user_id
    ).all()
    return [r.storage_path for r in rows if r.storage_path]


def _kb_path(user_id: str) -> Path:
    kb_dir = Path(settings.knowledge_bases_dir)
    return kb_dir / f"knowledge_base_user_{user_id}.json"


# ── Lógica principal ──────────────────────────────────────────────────────────

def audit_user(db: Session, user: User) -> dict:
    """Recopila un resumen de todo lo que se borraría."""
    uid = user.user_id
    snapshots = _count(db, AnalysisSnapshot, uid)
    file_paths = _get_file_paths(db, uid)
    kb_file = _kb_path(str(uid))

    return {
        "user_id": str(uid),
        "email": user.email,
        "full_name": user.full_name,
        "social_provider": user.social_provider,
        "db": {
            "bank_accounts": _count(db, BankAccount, uid),
            "processing_jobs": _count(db, ProcessingJob, uid),
            "analysis_snapshots": snapshots,
            "analysis_transactions": _count_transactions(db, uid),
            "uploaded_files": len(file_paths),
            "user_profiles": _count(db, UserProfile, uid),
            "manual_wallets": _count(db, ManualWallet, uid),
            "savings_goals": _count(db, SavingsGoal, uid),
        },
        "filesystem": {
            "kb_personal": str(kb_file) if kb_file.exists() else None,
            "uploaded_files": [p for p in file_paths if Path(p).exists()],
            "uploaded_files_missing": [p for p in file_paths if not Path(p).exists()],
        },
    }


def print_audit(info: dict) -> None:
    print("\n" + "=" * 60)
    print("  USUARIO A ELIMINAR")
    print("=" * 60)
    print(f"  ID:       {info['user_id']}")
    print(f"  Email:    {info['email']}")
    print(f"  Nombre:   {info['full_name']}")
    if info["social_provider"]:
        print(f"  OAuth:    {info['social_provider']}")

    print("\n  Registros en base de datos:")
    for table, count in info["db"].items():
        print(f"    {table:<30} {count:>6} registros")

    print("\n  Archivos en filesystem:")
    kb = info["filesystem"]["kb_personal"]
    if kb:
        print(f"    KB personal:  {kb}")
    else:
        print("    KB personal:  (no existe)")

    uploads = info["filesystem"]["uploaded_files"]
    missing = info["filesystem"]["uploaded_files_missing"]
    if uploads:
        print(f"    Uploads ({len(uploads)} archivos):")
        for p in uploads:
            print(f"      {p}")
    if missing:
        print(f"    Uploads no encontrados en disco ({len(missing)}):")
        for p in missing:
            print(f"      {p} ← ya no existe, solo el registro en DB")
    if not uploads and not missing:
        print("    Uploads: (ninguno)")
    print("=" * 60)


def delete_user(db: Session, user: User, info: dict) -> None:
    """Ejecuta la eliminación completa."""
    uid = user.user_id

    # 1. Recopilar rutas de filesystem ANTES de tocar la DB
    kb_file = Path(info["filesystem"]["kb_personal"]) if info["filesystem"]["kb_personal"] else None
    upload_paths = [Path(p) for p in info["filesystem"]["uploaded_files"]]

    # 2. Eliminar el usuario — CASCADE en Postgres borra todo lo demás:
    #    bank_accounts, processing_jobs, analysis_snapshots, analysis_transactions,
    #    uploaded_files, user_profiles, manual_wallets, savings_goals
    db.delete(user)
    db.commit()
    print("\n  ✓ Usuario y todos sus registros eliminados de la base de datos.")

    # 3. Eliminar KB personal del filesystem
    if kb_file and kb_file.exists():
        kb_file.unlink()
        print(f"  ✓ KB personal eliminado: {kb_file}")
    else:
        print("  ○ KB personal: no existía en disco.")

    # 4. Eliminar archivos subidos del filesystem
    deleted_files = 0
    for path in upload_paths:
        try:
            path.unlink()
            deleted_files += 1
        except FileNotFoundError:
            pass
        except Exception as exc:
            print(f"  ⚠ No se pudo eliminar {path}: {exc}")
    if deleted_files:
        print(f"  ✓ {deleted_files} archivo(s) de upload eliminado(s).")
    else:
        print("  ○ Archivos de upload: no había nada en disco.")

    print("\n  Eliminación completa.")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Elimina un usuario y todos sus datos de SAFPRO."
    )
    parser.add_argument("--email", required=True, help="Email del usuario a eliminar.")
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Sin este flag el script corre en modo dry-run y solo muestra lo que se borraría.",
    )
    args = parser.parse_args()

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email).first()
        if not user:
            print(f"\nError: no se encontró ningún usuario con email '{args.email}'.")
            sys.exit(1)

        info = audit_user(db, user)
        print_audit(info)

        if not args.execute:
            print("\n  [DRY-RUN] Nada fue eliminado.")
            print("  Para ejecutar la eliminación, agrega --execute al comando.")
            return

        # Confirmación explícita antes de borrar
        print(f"\n  ⚠  Esto eliminará PERMANENTEMENTE todos los datos de {args.email}.")
        confirm = input("  Escribe 'CONFIRMAR' para continuar: ").strip()
        if confirm != "CONFIRMAR":
            print("  Operación cancelada.")
            sys.exit(0)

        delete_user(db, user, info)

    finally:
        db.close()


if __name__ == "__main__":
    main()
