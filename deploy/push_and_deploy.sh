#!/bin/bash
# ── SAFPRO — push_and_deploy.sh ───────────────────────────────────────────────
# Corre este script desde Git Bash en Windows.
# Empaqueta el código, lo sube al servidor Linux y ejecuta deploy_linux.sh.
#
# Uso (desde Git Bash):
#   cd "/c/Users/Alexis Pineda/Sistema_de_Analisis_Financiero"
#   bash deploy/push_and_deploy.sh
#
# Primera vez: te pedirá la contraseña de SSH 3 veces (ssh-copy-id + 2 scp).
# Después de la primera vez: no pide contraseña (usa clave SSH).
# ─────────────────────────────────────────────────────────────────────────────
set -e

SERVER="lex@100.88.92.80"
REMOTE_DIR="~/safpro"

# Detectar directorio del proyecto (donde está este script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SAFPRO — Push & Deploy"
echo "  Origen : $PROJECT_DIR"
echo "  Destino: $SERVER:$REMOTE_DIR"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Paso 0: Configurar clave SSH (solo primera vez) ───────────────────────────
SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
    echo ">>> Generando clave SSH (solo se hace una vez)..."
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -q
    echo "    Clave generada. Copiando al servidor (te pedirá tu contraseña)..."
    ssh-copy-id -i "${SSH_KEY}.pub" "$SERVER"
    echo "    ✅ Clave SSH instalada. Ya no te pedirá contraseña."
else
    echo ">>> Clave SSH ya existe: $SSH_KEY"
fi

# ── Paso 1: Crear estructura en el servidor ───────────────────────────────────
echo ""
echo ">>> [1/4] Preparando directorio remoto..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR/backend $REMOTE_DIR/frontend"

# ── Paso 2: Empaquetar y subir backend ───────────────────────────────────────
echo ""
echo ">>> [2/4] Empaquetando y subiendo backend..."
BACKEND_TAR="/tmp/safpro_backend_$(date +%s).tar.gz"

tar -czf "$BACKEND_TAR" \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='storage/uploads/*' \
    --exclude='storage/processed/*' \
    --exclude='storage/temp/*' \
    --exclude='backend/.env' \
    -C "$PROJECT_DIR" \
    backend/

echo "    Subiendo $(du -sh "$BACKEND_TAR" | cut -f1) → servidor..."
scp -q "$BACKEND_TAR" "$SERVER:/tmp/safpro_backend.tar.gz"
ssh "$SERVER" "
    # Backup explícito del .env antes de extraer
    cp $REMOTE_DIR/backend/.env /tmp/safpro_env_backup 2>/dev/null || true
    mkdir -p $REMOTE_DIR/backend
    cd $REMOTE_DIR/backend
    tar xzf /tmp/safpro_backend.tar.gz --strip-components=1
    rm /tmp/safpro_backend.tar.gz
    # Restaurar .env si existía (nunca sobreescribir producción con dev)
    if [ -f /tmp/safpro_env_backup ]; then
        cp /tmp/safpro_env_backup $REMOTE_DIR/backend/.env
        rm /tmp/safpro_env_backup
        echo '    .env de producción restaurado.'
    fi
"
rm -f "$BACKEND_TAR"
echo "    ✅ Backend subido."

# ── Paso 3: Empaquetar y subir frontend ──────────────────────────────────────
echo ""
echo ">>> [3/4] Empaquetando y subiendo frontend..."
FRONTEND_TAR="/tmp/safpro_frontend_$(date +%s).tar.gz"

tar -czf "$FRONTEND_TAR" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.vite' \
    -C "$PROJECT_DIR" \
    frontend/

echo "    Subiendo $(du -sh "$FRONTEND_TAR" | cut -f1) → servidor..."
scp -q "$FRONTEND_TAR" "$SERVER:/tmp/safpro_frontend.tar.gz"
ssh "$SERVER" "mkdir -p $REMOTE_DIR/frontend && cd $REMOTE_DIR/frontend && tar xzf /tmp/safpro_frontend.tar.gz --strip-components=1 && rm /tmp/safpro_frontend.tar.gz"
rm -f "$FRONTEND_TAR"
echo "    ✅ Frontend subido."

# ── Paso 4: Subir y ejecutar deploy_linux.sh ─────────────────────────────────
echo ""
echo ">>> [4/4] Ejecutando deploy en el servidor..."
scp -q "$SCRIPT_DIR/deploy_linux.sh" "$SERVER:~/deploy.sh"
ssh -t "$SERVER" "chmod +x ~/deploy.sh && bash ~/deploy.sh"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅  Push & Deploy completado"
echo "════════════════════════════════════════════════════════"
