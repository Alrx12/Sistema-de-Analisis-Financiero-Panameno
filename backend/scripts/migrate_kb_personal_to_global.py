"""
scripts/migrate_kb_personal_to_global.py
-----------------------------------------
Migra las entradas de los KBs personales al KB global, limpiando la deuda
acumulada por la lógica de routing antigua (que mandaba comercios a personal).

Regla de migración:
  - budget_role == "solo_balance" → queda en KB personal (transferencia propia)
  - todo lo demás                → va al KB global (comercios, servicios, etc.)

El script:
  1. Crea backups de todos los KBs antes de modificarlos
  2. Canonicaliza cada clave antes de escribirla en global
  3. Si la clave ya existe en global, el global tiene prioridad (no se sobreescribe)
  4. Elimina de cada KB personal las entradas migradas
  5. Hace lo mismo para los patrones (patterns)
  6. Imprime un resumen de qué se movió y qué quedó

Uso (desde backend/ con el virtualenv activo):
    python scripts/migrate_kb_personal_to_global.py

Flags opcionales:
    --dry-run   Solo imprime qué haría, sin modificar archivos
    --force     Sobreescribe entradas globales con las personales si hay conflicto
                (por defecto el global tiene prioridad en conflictos)
"""
import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

# Importar canonicalize_detail desde el módulo de la app
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.detail_normalizer import canonicalize_detail


KB_DIR = Path(__file__).resolve().parents[1] / "storage" / "knowledge_bases"
GLOBAL_KB_PATH = KB_DIR / "knowledge_base_global.json"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


# ── Utilidades ────────────────────────────────────────────────────────────────

def load_kb(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"exact_matches": {}, "patterns": {}, "word_weights": {}, "corrections_count": 0}


def save_kb(path: Path, data: dict, dry_run: bool = False) -> None:
    if dry_run:
        print(f"  [DRY RUN] Se escribiría: {path.name}")
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def backup(path: Path, dry_run: bool = False) -> None:
    if not path.exists():
        return
    backup_path = path.with_suffix(f".backup.{TIMESTAMP}.json")
    if dry_run:
        print(f"  [DRY RUN] Backup: {path.name} → {backup_path.name}")
    else:
        shutil.copy2(path, backup_path)
        print(f"  Backup: {backup_path.name}")


def is_personal_entry(cats: dict) -> bool:
    """
    Retorna True si la entrada debe quedarse en el KB personal.

    Criterios (misma lógica que financial_classifier.learn()):
      1. budget_role == "solo_balance"  → transferencia entre cuentas propias
      2. Economic Type == "transferencia_tercero" → pago a persona específica
         (YAPPY A CARLOS, ACH XPRESS A MARIA, etc.)
    """
    budget_role   = cats.get("budget_role", "")
    economic_type = (cats.get("Economic Type") or "").lower().strip()
    return (
        budget_role == "solo_balance"
        or economic_type == "transferencia_tercero"
    )


# ── Migración de exact_matches ────────────────────────────────────────────────

def migrate_exact_matches(
    personal: dict,
    global_kb: dict,
    user_label: str,
    dry_run: bool,
    force: bool,
) -> tuple[int, int, int]:
    """
    Retorna (migradas, ya_en_global_omitidas, kept_personal).
    Modifica personal y global_kb en lugar.
    """
    migradas = 0
    omitidas = 0
    kept = 0
    to_delete = []

    for raw_key, cats in list(personal.get("exact_matches", {}).items()):
        if is_personal_entry(cats):
            kept += 1
            continue

        # Canonicalizar la clave antes de escribirla en global
        canonical = canonicalize_detail(raw_key)
        if not canonical:
            canonical = raw_key  # fallback

        if canonical in global_kb["exact_matches"] and not force:
            # Global ya tiene este comercio — omitimos, no sobreescribimos
            print(f"  [{user_label}] OMITIDO (ya en global): {canonical!r}")
            omitidas += 1
        else:
            action = "SOBREESCRITO" if (canonical in global_kb["exact_matches"] and force) else "MIGRADO"
            global_kb["exact_matches"][canonical] = cats
            print(f"  [{user_label}] {action}: {raw_key!r} → {canonical!r}")
            migradas += 1

        to_delete.append(raw_key)

    for key in to_delete:
        del personal["exact_matches"][key]

    return migradas, omitidas, kept


# ── Migración de patterns ─────────────────────────────────────────────────────

def migrate_patterns(
    personal: dict,
    global_kb: dict,
    user_label: str,
    dry_run: bool,
    force: bool,
) -> tuple[int, int, int]:
    """
    Migra patrones de comercios al KB global.
    Quedan en personal: solo_balance y transferencia_tercero.
    Retorna (migrados, omitidos, kept).
    """
    migrados = 0
    omitidos = 0
    kept = 0
    to_delete = []

    for pat_name, pat_data in list(personal.get("patterns", {}).items()):
        cats = pat_data.get("categories", {})
        if is_personal_entry(cats):
            kept += 1
            continue

        # Renombrar el patrón para evitar colisiones de nombres
        global_name = pat_name.replace("personal_", "global_", 1)
        if not global_name.startswith("global_"):
            global_name = f"global_{pat_name}"

        if global_name in global_kb["patterns"] and not force:
            print(f"  [{user_label}] PATTERN OMITIDO (ya en global): {global_name!r}")
            omitidos += 1
        else:
            migrated_pat = dict(pat_data)
            migrated_pat["source"] = f"migrated_from_{user_label}"
            global_kb["patterns"][global_name] = migrated_pat
            print(f"  [{user_label}] PATTERN MIGRADO: {pat_name!r} → {global_name!r}")
            migrados += 1

        to_delete.append(pat_name)

    for key in to_delete:
        del personal["patterns"][key]

    return migrados, omitidos, kept


# ── Main ──────────────────────────────────────────────────────────────────────

def main(dry_run: bool, force: bool) -> None:
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Migrando KBs personales → global")
    print(f"KB_DIR: {KB_DIR}\n")

    # Cargar global KB
    global_kb = load_kb(GLOBAL_KB_PATH)
    print(f"Global KB antes: {len(global_kb['exact_matches'])} exact_matches, "
          f"{len(global_kb['patterns'])} patterns\n")

    # Backup del global
    backup(GLOBAL_KB_PATH, dry_run)

    total_migradas = 0
    total_omitidas = 0
    total_kept = 0
    total_pat_migrados = 0

    user_kb_paths = sorted(KB_DIR.glob("knowledge_base_user_*.json"))

    for user_path in user_kb_paths:
        user_label = user_path.stem.replace("knowledge_base_user_", "")[:8]
        personal = load_kb(user_path)

        em_before = len(personal.get("exact_matches", {}))
        pat_before = len(personal.get("patterns", {}))

        print(f"─── {user_path.name} ({em_before} exact_matches, {pat_before} patterns)")

        # Backup del personal
        backup(user_path, dry_run)

        # Migrar exact_matches
        m, o, k = migrate_exact_matches(personal, global_kb, user_label, dry_run, force)
        total_migradas += m
        total_omitidas += o
        total_kept += k

        # Migrar patterns
        pm, po, pk = migrate_patterns(personal, global_kb, user_label, dry_run, force)
        total_pat_migrados += pm

        em_after = len(personal.get("exact_matches", {}))
        print(f"  → exact_matches: {em_before} → {em_after} "
              f"(migradas={m}, omitidas={o}, kept_solo_balance={k})\n")

        save_kb(user_path, personal, dry_run)

    # Guardar global actualizado
    save_kb(GLOBAL_KB_PATH, global_kb, dry_run)

    print("\n══════════════════════════════════════")
    print(f"RESUMEN {'(DRY RUN)' if dry_run else ''}")
    print(f"  exact_matches migradas al global:  {total_migradas}")
    print(f"  exact_matches ya en global (skip): {total_omitidas}")
    print(f"  exact_matches kept en personal:    {total_kept} (solo_balance + transferencia_tercero)")
    print(f"  patterns migrados al global:       {total_pat_migrados}")
    print(f"  Global KB después: {len(global_kb['exact_matches'])} exact_matches, "
          f"{len(global_kb['patterns'])} patterns")
    print("══════════════════════════════════════\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migra KBs personales → global.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Solo imprime qué haría, sin modificar archivos.")
    parser.add_argument("--force", action="store_true",
                        help="Sobreescribe entradas globales con las personales si hay conflicto.")
    args = parser.parse_args()

    main(dry_run=args.dry_run, force=args.force)
