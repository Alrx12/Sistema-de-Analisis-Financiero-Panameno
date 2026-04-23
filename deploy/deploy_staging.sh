#!/bin/bash
# ── SAFPRO — deploy_staging.sh ────────────────────────────────────────────────
# Deploy rápido al entorno de staging en el servidor.
# Ejecutar desde Windows (Git Bash): bash deploy/deploy_staging.sh
#
# Prerequisito: staging ya debe estar configurado (ver deploy/STAGING.md).
# Prerequisito: PGPASSWORD exportado en la sesión o en ~/.pgpass.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER="lex@100.88.92.80"
STAGING_DIR="~/safpro-staging"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SAFPRO — Deploy a Staging"
echo "════════════════════════════════════════════════════════"
echo ""

ssh "$SERVER" bash << 'ENDSSH'
  set -e
  STAGING_DIR="$HOME/safpro-staging"
  DB_URL="postgresql+psycopg://apineda:${PGPASSWORD:-InsightLex}@localhost:5432/safpro_staging"

  echo "[1/5] git pull en staging..."
  cd "$STAGING_DIR"
  git pull origin main

  echo "[2/5] Instalando dependencias Python..."
  cd "$STAGING_DIR/backend"
  source .venv/bin/activate
  pip install -r requirements.txt -q --break-system-packages 2>/dev/null || pip install -r requirements.txt -q

  echo "[3/5] Aplicando migraciones en safpro_staging..."
  DATABASE_URL="$DB_URL" alembic upgrade head

  echo "[4/5] Rebuild frontend de staging..."
  cd "$STAGING_DIR/frontend"
  npm ci --frozen-lockfile --silent
  npm run build

  echo "[5/5] Reiniciando servicios de staging..."
  systemctl --user restart safpro-staging-api safpro-staging-worker
  sleep 3
  echo ""
  echo "safpro-staging-api   : $(systemctl --user is-active safpro-staging-api)"
  echo "safpro-staging-worker: $(systemctl --user is-active safpro-staging-worker)"

  echo ""
  echo "Verificando API..."
  curl -sf http://localhost:8002/api/v1/health | python3 -m json.tool 2>/dev/null \
    && echo "✅ API OK" \
    || echo "❌ ERROR: API no responde en :8002"
ENDSSH

echo ""
echo "✅  Deploy a staging completado."
echo "    URL: https://staging.safpro.us"
echo ""
