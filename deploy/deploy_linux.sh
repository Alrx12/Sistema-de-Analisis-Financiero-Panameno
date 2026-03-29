#!/bin/bash
# ── SAFPRO — deploy_linux.sh ──────────────────────────────────────────────────
# Corre este script en el servidor Linux para instalar y configurar SAFPRO.
# Asume Ubuntu 22.04+ con PostgreSQL ya corriendo en localhost.
#
# Uso:
#   bash ~/deploy.sh
#
# Lo que hace:
#   1. Instala redis-server, nginx, python3-venv, nodejs, npm
#   2. Crea el virtualenv e instala requirements.txt
#   3. Crea backend/.env si no existe
#   4. Corre migraciones de Alembic
#   5. Hace build del frontend (npm install && npm run build)
#   6. Crea servicios systemd de usuario para uvicorn y celery
#   7. Configura nginx para servir el frontend y hacer proxy de /api
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="$HOME/safpro"
VENV_DIR="$APP_DIR/backend/.venv"
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "")

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SAFPRO — Deploy Script"
echo "  App dir : $APP_DIR"
echo "  User    : $USER"
echo "  Public IP detectada: ${PUBLIC_IP:-'(no se pudo detectar)'}"
echo "════════════════════════════════════════════════════════"
echo ""

# ── 1. Dependencias del sistema ───────────────────────────────────────────────
echo ">>> [1/8] Instalando dependencias del sistema..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    redis-server \
    nginx \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libpq-dev \
    curl

# Node.js 20.x (si no está instalado)
if ! command -v node &>/dev/null; then
    echo "    Instalando Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
    sudo apt-get install -y nodejs
fi

echo "    Python : $(python3 --version)"
echo "    Node   : $(node --version)"
echo "    npm    : $(npm --version)"
echo "    Redis  : $(redis-cli ping 2>/dev/null || echo 'pendiente de start')"

# ── 2. Iniciar Redis ──────────────────────────────────────────────────────────
echo ""
echo ">>> [2/8] Configurando Redis..."
sudo systemctl enable redis-server --quiet
sudo systemctl start redis-server
sleep 1
echo "    Redis ping: $(redis-cli ping)"

# ── 3. Python virtualenv ──────────────────────────────────────────────────────
echo ""
echo ">>> [3/8] Creando virtualenv e instalando dependencias Python..."
cd "$APP_DIR/backend"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
echo "    OK — dependencias instaladas."

# ── 4. Directorios de storage ─────────────────────────────────────────────────
echo ""
echo ">>> [4/8] Creando directorios de storage..."
mkdir -p "$APP_DIR/storage/uploads" \
         "$APP_DIR/storage/processed" \
         "$APP_DIR/storage/temp" \
         "$APP_DIR/storage/knowledge_bases"

# Copiar KB global si no existe (viene incluido en backend/storage/)
KB_SRC="$APP_DIR/backend/storage/knowledge_bases/knowledge_base_global.json"
KB_DST="$APP_DIR/storage/knowledge_bases/knowledge_base_global.json"
if [ ! -f "$KB_DST" ] && [ -f "$KB_SRC" ]; then
    cp "$KB_SRC" "$KB_DST"
    echo "    KB global copiado."
fi

# ── 5. Archivo .env ───────────────────────────────────────────────────────────
echo ""
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ">>> [5/8] Creando backend/.env..."
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    DETECTED_URL="http://${PUBLIC_IP:-localhost}"

    # Pedir credenciales de la base de datos (no hardcodeadas en el script)
    echo ""
    echo "    Credenciales de PostgreSQL:"
    read -rp "    Usuario de la DB [safpro]: " DB_USER
    DB_USER="${DB_USER:-safpro}"
    read -rsp "    Contraseña de la DB: " DB_PASS
    echo ""

    cat > "$ENV_FILE" << ENVEOF
APP_NAME=SAFPRO API
APP_VERSION=0.1.0
DEBUG=false
DATABASE_URL=postgresql+psycopg://${DB_USER}:${DB_PASS}@localhost:5432/safpro
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
UPLOAD_DIR=${APP_DIR}/storage/uploads
PROCESSED_DIR=${APP_DIR}/storage/processed
TEMP_DIR=${APP_DIR}/storage/temp
KNOWLEDGE_BASES_DIR=${APP_DIR}/storage/knowledge_bases
REDIS_URL=redis://localhost:6379/0
RESEND_API_KEY=re_placeholder_cambia_esto
EMAIL_FROM=SAFPRO <noreply@safpro.us>
FRONTEND_URL=${DETECTED_URL}
ENVEOF
    chmod 600 "$ENV_FILE"
    echo "    .env creado en $ENV_FILE (permisos 600)"
    echo "    ⚠️  Edita $ENV_FILE para poner tu RESEND_API_KEY real."
else
    echo ">>> [5/8] .env ya existe — omitiendo creación."
    echo "    Ubicación: $ENV_FILE"
fi

# ── 6. Migraciones de base de datos ──────────────────────────────────────────
echo ""
echo ">>> [6/8] Corriendo migraciones de Alembic..."
cd "$APP_DIR/backend"
.venv/bin/alembic upgrade head
echo "    Migraciones OK."

# ── 7. Build del frontend ─────────────────────────────────────────────────────
echo ""
echo ">>> [7/8] Instalando dependencias y haciendo build del frontend..."
cd "$APP_DIR/frontend"
npm install --silent 2>/dev/null
npm run build 2>/dev/null
echo "    Frontend build OK → $APP_DIR/frontend/dist/"

# ── 8. Servicios systemd de usuario ──────────────────────────────────────────
echo ""
echo ">>> [8/8] Configurando servicios systemd..."
mkdir -p ~/.config/systemd/user/

# safpro-api.service
cat > ~/.config/systemd/user/safpro-api.service << SVCEOF
[Unit]
Description=SAFPRO API (uvicorn)
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/backend
ExecStart=${VENV_DIR}/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5
Environment=PATH=${VENV_DIR}/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
SVCEOF

# safpro-worker.service
cat > ~/.config/systemd/user/safpro-worker.service << SVCEOF
[Unit]
Description=SAFPRO Celery Worker
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/backend
ExecStart=${VENV_DIR}/bin/celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
Restart=always
RestartSec=10
Environment=PATH=${VENV_DIR}/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
SVCEOF

systemctl --user daemon-reload
systemctl --user enable safpro-api safpro-worker
systemctl --user restart safpro-api safpro-worker

# Habilitar linger para que los servicios sobrevivan al cierre de sesión
sudo loginctl enable-linger "$USER"

sleep 2
echo "    safpro-api   : $(systemctl --user is-active safpro-api)"
echo "    safpro-worker: $(systemctl --user is-active safpro-worker)"

# ── nginx ─────────────────────────────────────────────────────────────────────
echo ""
echo ">>> Configurando nginx..."

# Construir lista de server_names con todas las IPs disponibles
SERVER_NAMES="_"
if [ -n "$PUBLIC_IP" ]; then
    SERVER_NAMES="$PUBLIC_IP 100.88.92.80 _"
fi

cat > /tmp/safpro_nginx.conf << NGINXEOF
server {
    listen 80;
    server_name ${SERVER_NAMES};

    root ${APP_DIR}/frontend/dist;
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
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";

        client_max_body_size 20M;
        proxy_read_timeout   30s;
        proxy_connect_timeout 5s;
    }

    # ── Frontend SPA ─────────────────────────────────────────────────────────
    location / {
        try_files \$uri \$uri/ /index.html;
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

sudo cp /tmp/safpro_nginx.conf /etc/nginx/sites-available/safpro
sudo ln -sf /etc/nginx/sites-available/safpro /etc/nginx/sites-enabled/safpro
sudo rm -f /etc/nginx/sites-enabled/default

if sudo nginx -t 2>/dev/null; then
    sudo systemctl restart nginx
    echo "    nginx OK y corriendo."
else
    echo "    ⚠️  Error en configuración de nginx. Revisa: sudo nginx -t"
fi

# ── Firewall (ufw) ────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    sudo ufw allow 80/tcp >/dev/null 2>&1 || true
    echo "    Firewall: puerto 80 permitido."
fi

# ── Resumen final ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅  SAFPRO desplegado exitosamente"
echo ""
if [ -n "$PUBLIC_IP" ]; then
    echo "  🌐  URL pública : http://${PUBLIC_IP}"
fi
echo "  🔒  URL Tailscale: http://100.88.92.80"
echo ""
echo "  Comandos útiles:"
echo "    Ver estado API   : systemctl --user status safpro-api"
echo "    Ver estado Worker: systemctl --user status safpro-worker"
echo "    Logs API         : journalctl --user -u safpro-api -f"
echo "    Logs Worker      : journalctl --user -u safpro-worker -f"
echo "    Reiniciar todo   : systemctl --user restart safpro-api safpro-worker"
echo ""
echo "  Para actualizar el código más adelante:"
echo "    cd ~/safpro && git pull  (si usas git)"
echo "    O corre de nuevo push_and_deploy.sh desde Windows"
echo "════════════════════════════════════════════════════════"
echo ""
