"""
scripts/clean_personal_kbs.py — Opción B
-----------------------------------------
Limpia los KBs personales eliminando todas las entradas que NO son
transferencias personales. El KB global NO se toca.

Qué se conserva en cada KB personal:
  - exact_matches con budget_role == "solo_balance"
      → transferencias entre cuentas propias del mismo usuario
  - exact_matches con Economic Type == "transferencia_tercero"
      → pagos a personas específicas (YAPPY A CARLOS, ACH XPRESS A MARIA, etc.)
  - patterns cuyas categorías cumplan los mismos criterios

Qué se elimina:
  - Todo lo demás: comercios, restaurantes, servicios, suscripciones, etc.
    Esos se aprenderán de nuevo vía /learn o /reclassify y esta vez irán
    directamente al KB global (nueva lógica de routing).

Uso (desde backend/ con el virtualenv activo):
    python scripts/clean_personal_kbs.py --dry-run   # ver qué haría
    python scripts/clean_personal_kbs.py             # ejecutar limpieza
"""
import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

KB_DIR   = Path(__file__).resolve().parents[1] / "storage" / "knowledge_bases"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_kb(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_kb(path: Path, data: dict, dry_run: bool) -> None:
    if dry_run:
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def backup(path: Path, dry_run: bool) -> None:
    if dry_run:
        return
    dst = path.with_suffix(f".backup.pre_clean.{TIMESTAMP}.json")
    shutil.copy2(path, dst)
    print(f"  backup → {dst.name}")


def keep_entry(cats: dict) -> bool:
    """True si la entrada debe conservarse en el KB personal."""
    role  = cats.get("budget_role", "")
    etype = (cats.get("Economic Type") or "").lower().strip()
    return role == "solo_balance" or etype == "transferencia_tercero"


# ── Main ──────────────────────────────────────────────────────────────────────

def clean_kb(path: Path, dry_run: bool) -> None:
    uid = path.stem.replace("knowledge_base_user_", "")[:8]
    kb  = load_kb(path)

    em_before  = len(kb.get("exact_matches", {}))
    pat_before = len(kb.get("patterns", {}))

    # ── exact_matches ────────────────────────────────────────────────────────
    kept_em  = {k: v for k, v in kb.get("exact_matches", {}).items() if keep_entry(v)}
    drop_em  = {k: v for k, v in kb.get("exact_matches", {}).items() if not keep_entry(v)}

    # ── patterns ─────────────────────────────────────────────────────────────
    kept_pat = {k: v for k, v in kb.get("patterns", {}).items()
                if keep_entry(v.get("categories", {}))}
    drop_pat = {k: v for k, v in kb.get("patterns", {}).items()
                if not keep_entry(v.get("categories", {}))}

    print(f"\n[{uid}] {path.name}")
    print(f"  exact_matches : {em_before:4d} → {len(kept_em):4d}  "
          f"(eliminadas: {len(drop_em)})")

    if drop_em and dry_run:
        for k, v in sorted(drop_em.items()):
            role  = v.get("budget_role", "?")
            etype = v.get("Economic Type", "?")
            bcat  = v.get("Categoría de presupuesto", "?")
            print(f"    DROP [{role:20s}][{etype:18s}][{bcat:18s}]  {k[:60]}")

    print(f"  patterns      : {pat_before:4d} → {len(kept_pat):4d}  "
          f"(eliminados: {len(drop_pat)})")

    if not dry_run:
        backup(path, dry_run=False)
        kb["exact_matches"] = kept_em
        kb["patterns"]      = kept_pat
        save_kb(path, kb, dry_run=False)
        print(f"  ✓ guardado")


def main(dry_run: bool) -> None:
    label = "[DRY RUN] " if dry_run else ""
    print(f"\n{label}Limpiando KBs personales (global intacto)")
    print(f"KB_DIR: {KB_DIR}")

    user_kbs = sorted(KB_DIR.glob("knowledge_base_user_*.json"))
    if not user_kbs:
        print("No se encontraron KBs personales.")
        return

    total_drop = 0
    total_kept = 0

    for path in user_kbs:
        kb = load_kb(path)
        em = kb.get("exact_matches", {})
        d  = sum(1 for v in em.values() if not keep_entry(v))
        k  = sum(1 for v in em.values() if keep_entry(v))
        total_drop += d
        total_kept += k
        clean_kb(path, dry_run)

    print(f"\n{'═'*46}")
    print(f"{'DRY RUN — ' if dry_run else ''}RESUMEN")
    print(f"  Entradas eliminadas : {total_drop}")
    print(f"  Entradas conservadas: {total_kept}  (solo_balance + transferencia_tercero)")
    print(f"  KB global           : intacto")
    if dry_run:
        print(f"\n  Para aplicar: python scripts/clean_personal_kbs.py")
    print(f"{'═'*46}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Muestra qué se eliminaría sin modificar nada.")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
