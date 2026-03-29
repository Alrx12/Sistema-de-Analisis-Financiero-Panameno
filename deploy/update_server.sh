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
echo ">>> Actualizando configuración nginx (security headers)..."
cat > /tmp/safpro_nginx_update.conf << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    root /home/lex/safpro/frontend/dist;
    index index.html;

    # ── Security Headers ─────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;

    # ── API proxy ────────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";

        client_max_body_size 20M;
        proxy_read_timeout   30s;
        proxy_connect_timeout 5s;
    }

    # ── Frontend SPA ─────────────────────────────────────────────────────────
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache assets con hash en el nombre
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
    }

    # No cachear index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
NGINXEOF

scp -q /tmp/safpro_nginx_update.conf "$SERVER:/tmp/safpro_nginx.conf"
ssh "$SERVER" "sudo cp /tmp/safpro_nginx.conf /etc/nginx/sites-available/safpro && sudo ln -sf /etc/nginx/sites-available/safpro /etc/nginx/sites-enabled/safpro && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx && rm /tmp/safpro_nginx.conf && echo '    nginx recargado con security headers.'"
rm -f /tmp/safpro_nginx_update.conf

echo ""
echo "✅  Actualización completada."
echo ""
