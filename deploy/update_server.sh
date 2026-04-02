#!/bin/bash
# ── SAFPRO — update_server.sh ─────────────────────────────────────────────────
# Actualización rápida: sube solo el código y reinicia los servicios.
# NO reinstala dependencias ni reconfigura nginx/systemd.
#
# Uso (desde Git Bash):
#   cd "/c/Users/Alexis Pineda/Sistema_de_Analisis_Financiero"
#   bash deploy/update_server.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

SERVER="lex@100.88.92.80"
REMOTE_DIR="~/safpro"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SAFPRO — Actualización rápida del servidor"
echo "════════════════════════════════════════════════════════"
echo ""

# Backend
echo ">>> Subiendo backend..."
BACKEND_TAR="/tmp/safpro_backend_update.tar.gz"
tar -czf "$BACKEND_TAR" \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='storage' \
    --exclude='.env' \
    -C "$PROJECT_DIR/backend" .
scp -q "$BACKEND_TAR" "$SERVER:/tmp/safpro_backend_update.tar.gz"
ssh "$SERVER" "cd $REMOTE_DIR/backend && tar xzf /tmp/safpro_backend_update.tar.gz && rm /tmp/safpro_backend_update.tar.gz"
rm -f "$BACKEND_TAR"
echo "    ✅ Backend actualizado."

# Frontend
echo ">>> Subiendo y rebuildeando frontend..."
FRONTEND_TAR="/tmp/safpro_frontend_update.tar.gz"
tar -czf "$FRONTEND_TAR" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.vite' \
    -C "$PROJECT_DIR/frontend" .
scp -q "$FRONTEND_TAR" "$SERVER:/tmp/safpro_frontend_update.tar.gz"
ssh "$SERVER" "cd $REMOTE_DIR/frontend && tar xzf /tmp/safpro_frontend_update.tar.gz && rm /tmp/safpro_frontend_update.tar.gz && npm install --silent && npm run build"
rm -f "$FRONTEND_TAR"
echo "    ✅ Frontend rebuildeado."

# Migraciones + reiniciar servicios
echo ">>> Corriendo migraciones y reiniciando servicios..."
ssh "$SERVER" "
    cd $REMOTE_DIR/backend
    .venv/bin/alembic upgrade head
    systemctl --user restart safpro-api safpro-worker
    sleep 2
    echo 'safpro-api   :' \$(systemctl --user is-active safpro-api)
    echo 'safpro-worker:' \$(systemctl --user is-active safpro-worker)
"

# Actualizar configuración nginx con security headers
# Usa deploy/nginx.conf como fuente — sin heredocs ni escaping complejo.
echo ">>> Actualizando configuración nginx (security headers)..."
NGINX_CONF="$SCRIPT_DIR/nginx.conf"
if [ ! -f "$NGINX_CONF" ]; then
    echo "    ⚠️  No se encontró deploy/nginx.conf — omitiendo actualización nginx."
else
    scp -q "$NGINX_CONF" "$SERVER:/tmp/safpro_nginx.conf"
    if ssh "$SERVER" "sudo cp /tmp/safpro_nginx.conf /etc/nginx/sites-available/safpro \
        && sudo ln -sf /etc/nginx/sites-available/safpro /etc/nginx/sites-enabled/safpro \
        && sudo rm -f /etc/nginx/sites-enabled/default \
        && sudo nginx -t \
        && sudo systemctl reload nginx \
        && rm /tmp/safpro_nginx.conf \
        && echo '    ✅ nginx recargado con security headers.'"; then
        echo "    nginx OK."
    else
        echo "    ⚠️  Falló la actualización de nginx. Aplica manualmente:"
        echo "      scp deploy/nginx.conf $SERVER:/tmp/safpro_nginx.conf"
        echo "      ssh $SERVER 'sudo cp /tmp/safpro_nginx.conf /etc/nginx/sites-available/safpro && sudo nginx -t && sudo systemctl reload nginx'"
    fi
fi

echo ""
echo "✅  Actualización completada."
echo ""
