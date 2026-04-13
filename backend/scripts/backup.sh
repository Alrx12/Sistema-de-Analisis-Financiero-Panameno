#!/bin/bash
# ── SAFPRO — backup.sh ────────────────────────────────────────────────────────
# Backup diario de PostgreSQL + storage/ a Cloudflare R2
#
# Instalación (en el servidor):
#   cp ~/safpro/backend/scripts/backup.sh ~/safpro/scripts/backup.sh
#   chmod +x ~/safpro/scripts/backup.sh
#
# Cron (correr a las 3AM) — PGPASSWORD debe estar en el entorno del cron:
#   0 3 * * * PGPASSWORD="tu-password-real" ~/safpro/scripts/backup.sh >> ~/safpro/storage/logs/backup.log 2>&1
#
# Alternativa más segura — usar ~/.pgpass:
#   echo "localhost:5432:safpro:apineda:tu-password-real" >> ~/.pgpass && chmod 600 ~/.pgpass
#   Luego en el cron puedes omitir PGPASSWORD:
#   0 3 * * * ~/safpro/scripts/backup.sh >> ~/safpro/storage/logs/backup.log 2>&1
#
# Dependencias:
#   - rclone configurado con remote "r2" apuntando a Cloudflare R2
#   - bucket "safpro-backups" existente en R2
#   - PGPASSWORD en el entorno (o .pgpass configurado)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-safpro}"
DB_USER="${DB_USER:-apineda}"
# ⚠️  No hardcodeado — leer de entorno o de .pgpass en el servidor.
# En el servidor: export PGPASSWORD="tu-password" en el cron o en ~/.pgpass
PGPASSWORD="${PGPASSWORD:?ERROR: PGPASSWORD no está configurado. Agrega 'export PGPASSWORD=...' al cron o usa ~/.pgpass}"

APP_DIR="$HOME/safpro"
BACKUP_DIR="$APP_DIR/storage/backups"
LOG_PREFIX="[SAFPRO BACKUP $(date '+%Y-%m-%d %H:%M:%S')]"

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-safpro-backups}"
# 30 días locales: suficiente para detectar corrupción silenciosa descubierta tardíamente.
# Los backups en R2 también se limpian a 30 días (paso 4b).
RETENTION_DAYS=30

DATE=$(date '+%Y-%m-%d')
DB_BACKUP_FILE="$BACKUP_DIR/safpro_db_${DATE}.dump"

export PGPASSWORD

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
log "Iniciando backup — fecha: $DATE"

# ── 1. Backup de PostgreSQL ───────────────────────────────────────────────────
log "[1/4] Dumping PostgreSQL database '$DB_NAME'..."
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -Fc \
    --no-password \
    -f "$DB_BACKUP_FILE"

DB_SIZE=$(du -sh "$DB_BACKUP_FILE" | cut -f1)
log "      DB dump OK — tamaño: $DB_SIZE → $DB_BACKUP_FILE"

# ── 2. Subir DB dump a R2 ─────────────────────────────────────────────────────
log "[2/4] Subiendo DB dump a R2..."
rclone copy "$DB_BACKUP_FILE" "${R2_REMOTE}:${R2_BUCKET}/db/" \
    --transfers 1 \
    --retries 3 \
    --log-level ERROR
log "      R2 upload OK → ${R2_REMOTE}:${R2_BUCKET}/db/$(basename "$DB_BACKUP_FILE")"

# ── 3. Sync storage/ a R2 (excluye temp/ y logs/) ────────────────────────────
log "[3/4] Sincronizando storage/ a R2..."
rclone sync "$APP_DIR/storage/" "${R2_REMOTE}:${R2_BUCKET}/storage/" \
    --exclude "temp/**" \
    --exclude "logs/**" \
    --exclude "backups/**" \
    --transfers 4 \
    --retries 3 \
    --log-level ERROR
log "      R2 sync OK → ${R2_REMOTE}:${R2_BUCKET}/storage/"

# ── 4a. Limpieza local (retención 30 días) ────────────────────────────────────
log "[4/5] Limpiando backups locales con más de ${RETENTION_DAYS} días..."
find "$BACKUP_DIR" -name "safpro_db_*.dump" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "safpro_db_*.dump" | wc -l)
log "      Archivos locales restantes: $REMAINING"

# ── 4b. Limpieza remota en R2 (retención 30 días) ─────────────────────────────
log "[5/5] Limpiando backups en R2 con más de ${RETENTION_DAYS} días..."
rclone delete "${R2_REMOTE}:${R2_BUCKET}/db/" \
    --min-age "${RETENTION_DAYS}d" \
    --log-level ERROR
log "      R2 cleanup OK (eliminados dumps > ${RETENTION_DAYS} días)"

# ── Resumen ───────────────────────────────────────────────────────────────────
log "Backup completado exitosamente."
log "  DB dump    : $DB_BACKUP_FILE ($DB_SIZE)"
log "  R2 path    : ${R2_REMOTE}:${R2_BUCKET}/db/"
log "  Storage    : ${R2_REMOTE}:${R2_BUCKET}/storage/"
log "  Retención  : ${RETENTION_DAYS} días (local + R2)"
