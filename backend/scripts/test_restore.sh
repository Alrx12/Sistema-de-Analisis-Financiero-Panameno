#!/bin/bash
# ── SAFPRO — test_restore.sh ──────────────────────────────────────────────────
# Prueba que los backups de R2 realmente funcionan.
#
# Qué hace:
#   1. Lista los últimos backups disponibles en R2
#   2. Descarga el más reciente (o el que especifiques con --date)
#   3. Restaura a una DB temporal "safpro_restore_test"
#   4. Verifica integridad: conteo de tablas, filas, spot-checks
#   5. Compara conteos contra la DB de producción
#   6. Limpia todo (DB temporal + archivo local)
#   7. Imprime un reporte con PASS/FAIL
#
# Uso:
#   bash ~/safpro/backend/scripts/test_restore.sh
#   bash ~/safpro/backend/scripts/test_restore.sh --date 2026-04-05
#   bash ~/safpro/backend/scripts/test_restore.sh --keep   # no limpia la DB de prueba
#   bash ~/safpro/backend/scripts/test_restore.sh --list   # solo lista backups disponibles
#
# Correr periódicamente (ej: primer domingo del mes a las 4AM):
#   0 4 1-7 * 0 ~/safpro/backend/scripts/test_restore.sh >> ~/safpro/storage/logs/restore_test.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail   # NO -e para poder capturar errores y reportarlos

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-apineda}"
PGPASSWORD="${PGPASSWORD:-InsightLex}"

PROD_DB="${PROD_DB:-safpro}"
TEST_DB="${TEST_DB:-safpro_restore_test}"
APP_DIR="$HOME/safpro"
TEMP_BACKUP_DIR="$APP_DIR/storage/temp/restore_test"

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-safpro-backups}"
R2_DB_PREFIX="db/"

export PGPASSWORD

# ── Parse args ────────────────────────────────────────────────────────────────
TARGET_DATE=""
KEEP_DB=0
LIST_ONLY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --date) TARGET_DATE="$2"; shift 2 ;;
        --keep) KEEP_DB=1; shift ;;
        --list) LIST_ONLY=1; shift ;;
        *) echo "Uso: $0 [--date YYYY-MM-DD] [--keep] [--list]"; exit 1 ;;
    esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARNINGS=()
REPORT_LINES=()

log()     { echo "[$(date '+%H:%M:%S')] $*"; }
pass()    { PASS_COUNT=$((PASS_COUNT+1)); REPORT_LINES+=("  ✅ $*"); log "PASS: $*"; }
fail()    { FAIL_COUNT=$((FAIL_COUNT+1)); REPORT_LINES+=("  ❌ $*"); log "FAIL: $*"; }
warn()    { WARNINGS+=("$*"); REPORT_LINES+=("  ⚠️  $*"); log "WARN: $*"; }
section() { log ""; log "── $* ──────────────────────────────"; }

psql_prod() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$PROD_DB" -t -A -c "$1" 2>/dev/null; }
psql_test() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -t -A -c "$1" 2>/dev/null; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
section "Verificando prerequisitos"

if ! command -v rclone &>/dev/null; then
    echo "ERROR: rclone no está instalado. Ver: https://rclone.org/install/"
    exit 1
fi

if ! command -v pg_restore &>/dev/null; then
    echo "ERROR: pg_restore no está instalado (instala postgresql-client)"
    exit 1
fi

if ! rclone lsd "${R2_REMOTE}:${R2_BUCKET}" &>/dev/null; then
    echo "ERROR: No se puede acceder a ${R2_REMOTE}:${R2_BUCKET}"
    echo "  Verifica con: rclone lsd ${R2_REMOTE}:${R2_BUCKET}"
    exit 1
fi

log "Prerequisites OK"

# ── Listar backups disponibles ────────────────────────────────────────────────
section "Backups disponibles en R2"

AVAILABLE_BACKUPS=$(rclone lsf "${R2_REMOTE}:${R2_BUCKET}/${R2_DB_PREFIX}" 2>/dev/null | grep "\.dump$" | sort -r)

if [[ -z "$AVAILABLE_BACKUPS" ]]; then
    echo "ERROR: No se encontraron backups en ${R2_REMOTE}:${R2_BUCKET}/${R2_DB_PREFIX}"
    echo "  Asegúrate de que backup.sh haya corrido al menos una vez."
    exit 1
fi

echo "Backups encontrados:"
echo "$AVAILABLE_BACKUPS" | head -10 | while read -r f; do
    SIZE=$(rclone lsf --format "s" "${R2_REMOTE}:${R2_BUCKET}/${R2_DB_PREFIX}${f}" 2>/dev/null | head -1)
    echo "  - $f  ($SIZE bytes)"
done

if [[ "$LIST_ONLY" -eq 1 ]]; then
    TOTAL=$(echo "$AVAILABLE_BACKUPS" | wc -l)
    echo ""
    echo "Total: $TOTAL backups disponibles."
    exit 0
fi

# ── Seleccionar backup a restaurar ────────────────────────────────────────────
if [[ -n "$TARGET_DATE" ]]; then
    BACKUP_FILE="safpro_db_${TARGET_DATE}.dump"
    if ! echo "$AVAILABLE_BACKUPS" | grep -q "$BACKUP_FILE"; then
        echo "ERROR: No existe backup para la fecha $TARGET_DATE"
        echo "  Backups disponibles:"
        echo "$AVAILABLE_BACKUPS" | head -5 | sed 's/^/    /'
        exit 1
    fi
else
    # Usar el más reciente
    BACKUP_FILE=$(echo "$AVAILABLE_BACKUPS" | head -1)
fi

log "Usando backup: $BACKUP_FILE"

# ── Descargar backup ──────────────────────────────────────────────────────────
section "Descargando backup desde R2"

mkdir -p "$TEMP_BACKUP_DIR"
LOCAL_FILE="$TEMP_BACKUP_DIR/$BACKUP_FILE"

START_DOWNLOAD=$(date +%s)
log "Descargando ${R2_REMOTE}:${R2_BUCKET}/${R2_DB_PREFIX}${BACKUP_FILE}..."

if ! rclone copy "${R2_REMOTE}:${R2_BUCKET}/${R2_DB_PREFIX}${BACKUP_FILE}" "$TEMP_BACKUP_DIR/" \
        --transfers 1 \
        --retries 3 \
        --log-level ERROR; then
    fail "No se pudo descargar el backup desde R2"
    exit 1
fi

END_DOWNLOAD=$(date +%s)
DOWNLOAD_SECONDS=$((END_DOWNLOAD - START_DOWNLOAD))
FILE_SIZE=$(du -sh "$LOCAL_FILE" | cut -f1)
pass "Backup descargado en ${DOWNLOAD_SECONDS}s — tamaño: $FILE_SIZE"

# ── Crear DB de prueba ────────────────────────────────────────────────────────
section "Preparando base de datos de prueba: $TEST_DB"

# Eliminar si existe
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $TEST_DB;" &>/dev/null

# Crear nueva DB de prueba
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        -c "CREATE DATABASE $TEST_DB;" &>/dev/null; then
    fail "No se pudo crear la DB de prueba '$TEST_DB'"
    exit 1
fi

pass "DB de prueba '$TEST_DB' creada"

# ── Restaurar ─────────────────────────────────────────────────────────────────
section "Restaurando backup"

START_RESTORE=$(date +%s)
log "Corriendo pg_restore..."

RESTORE_LOG="$TEMP_BACKUP_DIR/restore_stderr.log"

if ! pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$TEST_DB" \
        --no-password \
        --no-owner \
        --no-privileges \
        --jobs 2 \
        "$LOCAL_FILE" 2>"$RESTORE_LOG"; then
    # pg_restore puede salir con código no-cero por warnings no fatales
    RESTORE_ERRORS=$(grep -c "ERROR:" "$RESTORE_LOG" 2>/dev/null || echo 0)
    if [[ "$RESTORE_ERRORS" -gt 0 ]]; then
        fail "pg_restore terminó con $RESTORE_ERRORS errores"
        grep "ERROR:" "$RESTORE_LOG" | head -5 | sed 's/^/    /'
    else
        RESTORE_WARNINGS=$(wc -l < "$RESTORE_LOG")
        warn "pg_restore tuvo $RESTORE_WARNINGS warnings (no fatales)"
    fi
else
    pass "pg_restore completado sin errores"
fi

END_RESTORE=$(date +%s)
RESTORE_SECONDS=$((END_RESTORE - START_RESTORE))
log "Restauración completada en ${RESTORE_SECONDS}s"

# ── Checks de integridad ──────────────────────────────────────────────────────
section "Verificaciones de integridad"

# 1. Tablas esperadas existen
EXPECTED_TABLES=(users bank_accounts uploaded_files processing_jobs analysis_snapshots analysis_transactions user_profiles manual_wallets savings_goals)
for TABLE in "${EXPECTED_TABLES[@]}"; do
    EXISTS=$(psql_test "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${TABLE}' AND table_schema = 'public';")
    if [[ "$EXISTS" == "1" ]]; then
        pass "Tabla '$TABLE' existe"
    else
        fail "Tabla '$TABLE' NO encontrada en el backup restaurado"
    fi
done

# 2. Conteo de filas — no debe estar vacío si prod tiene datos
log ""
log "Comparando conteos de filas (prod vs restaurado):"
printf "  %-30s %10s %10s %s\n" "Tabla" "PROD" "RESTORED" "Status"
printf "  %-30s %10s %10s %s\n" "─────" "────" "────────" "──────"

for TABLE in "${EXPECTED_TABLES[@]}"; do
    PROD_COUNT=$(psql_prod "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "N/A")
    TEST_COUNT=$(psql_test "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "ERROR")

    if [[ "$TEST_COUNT" == "ERROR" ]]; then
        STATUS="❌ ERROR"
        FAIL_COUNT=$((FAIL_COUNT+1))
    elif [[ "$PROD_COUNT" == "N/A" ]]; then
        STATUS="⚠️  prod inaccesible"
        WARNINGS+=("No se pudo comparar con prod para tabla $TABLE")
    elif [[ "$PROD_COUNT" == "$TEST_COUNT" ]]; then
        STATUS="✅ match"
        PASS_COUNT=$((PASS_COUNT+1))
    elif [[ "$TEST_COUNT" -lt "$PROD_COUNT" ]]; then
        # Diferencia por filas insertadas DESPUÉS del backup → normal
        DIFF=$((PROD_COUNT - TEST_COUNT))
        STATUS="⚠️  backup tiene -$DIFF filas (esperado si hay actividad post-backup)"
        WARNINGS+=("$TABLE: prod=$PROD_COUNT, backup=$TEST_COUNT (diff=-$DIFF, puede ser normal)")
    else
        STATUS="❌ FALLO: backup tiene MÁS filas que prod"
        FAIL_COUNT=$((FAIL_COUNT+1))
    fi

    printf "  %-30s %10s %10s %s\n" "$TABLE" "${PROD_COUNT}" "${TEST_COUNT}" "$STATUS"
done

# 3. Spot-check: último usuario en prod también existe en backup
log ""
LAST_USER_EMAIL=$(psql_prod "SELECT email FROM users ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || echo "")
if [[ -n "$LAST_USER_EMAIL" && "$LAST_USER_EMAIL" != "N/A" ]]; then
    IN_BACKUP=$(psql_test "SELECT COUNT(*) FROM users WHERE email = '${LAST_USER_EMAIL}';" 2>/dev/null || echo "0")
    if [[ "$IN_BACKUP" == "1" ]]; then
        pass "Spot-check: usuario más reciente ('$LAST_USER_EMAIL') presente en backup"
    else
        fail "Spot-check: usuario '$LAST_USER_EMAIL' NO encontrado en el backup"
    fi
else
    warn "No se pudo obtener el último usuario de prod para spot-check"
fi

# 4. Verificar que las analysis_transactions tienen datos
TX_COUNT=$(psql_test "SELECT COUNT(*) FROM analysis_transactions;" 2>/dev/null || echo "0")
if [[ "$TX_COUNT" -gt 0 ]]; then
    pass "analysis_transactions: $TX_COUNT filas restauradas"
else
    warn "analysis_transactions está vacía en el backup (¿DB de prod también está vacía?)"
fi

# ── Limpieza ──────────────────────────────────────────────────────────────────
section "Limpieza"

if [[ "$KEEP_DB" -eq 1 ]]; then
    log "  --keep activo: DB de prueba '$TEST_DB' conservada para inspección manual."
    log "  Para conectarse: psql -U $DB_USER -d $TEST_DB"
    log "  Para limpiar manualmente: dropdb -U $DB_USER $TEST_DB"
else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS $TEST_DB;" &>/dev/null
    log "  DB '$TEST_DB' eliminada"
fi

rm -f "$LOCAL_FILE" "$RESTORE_LOG"
rmdir "$TEMP_BACKUP_DIR" 2>/dev/null || true
log "  Archivos temporales eliminados"

# ── Reporte final ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  SAFPRO RESTORE TEST REPORT"
echo "  Fecha:   $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Backup:  $BACKUP_FILE ($FILE_SIZE)"
echo "  Tiempo:  descarga ${DOWNLOAD_SECONDS}s + restore ${RESTORE_SECONDS}s"
echo "────────────────────────────────────────────────────────"
for LINE in "${REPORT_LINES[@]}"; do
    echo "$LINE"
done
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo ""
    echo "  Advertencias:"
    for W in "${WARNINGS[@]}"; do
        echo "    ⚠️  $W"
    done
fi
echo "────────────────────────────────────────────────────────"
echo "  RESULTADO: $PASS_COUNT checks OK, $FAIL_COUNT checks FALLIDOS"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "  ✅ BACKUP VERIFICADO — la restauración funciona correctamente."
    echo "════════════════════════════════════════════════════════"
    exit 0
else
    echo "  ❌ FALLO — revisar los errores de arriba antes de confiar en este backup."
    echo "════════════════════════════════════════════════════════"
    exit 1
fi
