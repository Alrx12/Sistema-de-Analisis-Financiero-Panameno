# SAFPRO — Entorno de Staging

> **Objetivo:** probar cambios en un entorno idéntico a producción, en el mismo servidor,
> antes de desplegarlo a `safpro.us`. Evita que bugs críticos lleguen a los 25+ usuarios reales.

---

## Arquitectura

| Componente | Producción | Staging |
|---|---|---|
| URL | `https://safpro.us` | `https://staging.safpro.us` |
| Base de datos | `safpro` | `safpro_staging` |
| API port | `8001` (interno) | `8002` (interno) |
| systemd API | `safpro-api` | `safpro-staging-api` |
| systemd Worker | `safpro-worker` | `safpro-staging-worker` |
| Código fuente | `~/safpro/` | `~/safpro-staging/` |
| .env | `~/safpro/backend/.env` | `~/safpro-staging/backend/.env` |
| storage/ | `~/safpro/storage/` | `~/safpro-staging/storage/` |

---

## Setup inicial (una sola vez)

### 1. Crear la base de datos de staging

```bash
# En el servidor (SSH)
psql -U apineda -d postgres -c "CREATE DATABASE safpro_staging;"
```

### 2. Clonar el código en un directorio separado

```bash
# En el servidor
cp -r ~/safpro ~/safpro-staging
```

> En deploys posteriores se actualiza con `git pull` en `~/safpro-staging/`, no copiando otra vez.

### 3. Crear el .env de staging

```bash
# Copiar el .env de prod como base
cp ~/safpro/backend/.env ~/safpro-staging/backend/.env
```

Luego editar `~/safpro-staging/backend/.env` con los valores de staging:

```env
DEBUG=false
DATABASE_URL=postgresql+psycopg://apineda:TU_PASSWORD@localhost:5432/safpro_staging
FRONTEND_URL=https://staging.safpro.us
BACKEND_URL=https://staging.safpro.us

# PayPal — usar sandbox aunque staging sea "casi-producción"
PAYPAL_SANDBOX=true

# Mantener el mismo SECRET_KEY que prod para poder copiar tokens entre entornos si hace falta,
# o usar una clave distinta para aislamiento total (recomendado):
SECRET_KEY=OTRA_CLAVE_SEGURA_DE_32_CHARS_MINIMO
```

### 4. Aplicar migraciones en staging

```bash
cd ~/safpro-staging/backend
source .venv/bin/activate
DATABASE_URL="postgresql+psycopg://apineda:TU_PASSWORD@localhost:5432/safpro_staging" \
    alembic upgrade head
```

### 5. Crear los servicios systemd de staging

```bash
# ── API ──────────────────────────────────────────────────────────────────
cat > ~/.config/systemd/user/safpro-staging-api.service << 'EOF'
[Unit]
Description=SAFPRO Staging API
After=network.target

[Service]
WorkingDirectory=/home/lex/safpro-staging/backend
ExecStart=/home/lex/safpro-staging/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8002
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/lex/safpro-staging/backend/.env

[Install]
WantedBy=default.target
EOF

# ── Worker ────────────────────────────────────────────────────────────────
cat > ~/.config/systemd/user/safpro-staging-worker.service << 'EOF'
[Unit]
Description=SAFPRO Staging Celery Worker
After=network.target

[Service]
WorkingDirectory=/home/lex/safpro-staging/backend
ExecStart=/home/lex/safpro-staging/backend/.venv/bin/celery -A app.workers.celery_app worker --loglevel=info --concurrency=1
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/lex/safpro-staging/backend/.env

[Install]
WantedBy=default.target
EOF

# Recargar y arrancar
systemctl --user daemon-reload
systemctl --user enable --now safpro-staging-api
systemctl --user enable --now safpro-staging-worker
```

### 6. Configurar nginx para staging.safpro.us

Agregar este bloque en `/etc/nginx/sites-available/safpro` (junto al bloque de producción):

```nginx
# ── Staging — staging.safpro.us ────────────────────────────────────────────
server {
    listen 80;
    server_name staging.safpro.us;

    # Frontend de staging (build separado)
    root /home/lex/safpro-staging/frontend/dist;
    index index.html;

    # API de staging → puerto 8002
    location /api/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 7. Agregar el subdominio en Cloudflare

En el dashboard de Cloudflare:
- DNS → Add record
- Type: CNAME
- Name: `staging`
- Target: `safpro.us` (o la IP del tunnel)
- Proxy: ON (naranja)

Si usas Cloudflare Tunnel, agregar una entrada en la config del tunnel:
```yaml
# /etc/cloudflared/config.yml — agregar debajo de la entrada de safpro.us
- hostname: staging.safpro.us
  service: http://localhost:80
```
Luego: `sudo systemctl restart cloudflared`

---

## Workflow de deploy a staging

Antes de hacer `bash deploy/update_server.sh` (que va a producción), hacer esto:

```bash
# 1. En el servidor — actualizar código de staging desde Git
cd ~/safpro-staging
git pull origin main

# 2. Reinstalar dependencias si cambiaron
cd backend && source .venv/bin/activate && pip install -r requirements.txt -q

# 3. Aplicar migraciones en staging
DATABASE_URL="postgresql+psycopg://apineda:TU_PASSWORD@localhost:5432/safpro_staging" \
    alembic upgrade head

# 4. Rebuild frontend de staging
cd ~/safpro-staging/frontend
VITE_API_URL=https://staging.safpro.us npm run build

# 5. Reiniciar servicios de staging
systemctl --user restart safpro-staging-api safpro-staging-worker

# 6. Verificar que funciona
curl -s https://staging.safpro.us/api/v1/health | python3 -m json.tool
```

---

## Crear script de deploy-to-staging (atajo)

Guardar como `deploy/deploy_staging.sh`:

```bash
#!/bin/bash
# Deploy rápido al entorno de staging en el servidor.
# Ejecutar desde Windows (Git Bash): bash deploy/deploy_staging.sh

set -euo pipefail

SERVER="lex@100.88.92.80"
STAGING_DIR="~/safpro-staging"
DB_URL="postgresql+psycopg://apineda:\${PGPASSWORD}@localhost:5432/safpro_staging"

echo "==> Desplegando a staging..."

ssh "$SERVER" bash << ENDSSH
  set -e
  cd $STAGING_DIR

  echo "[1/4] git pull..."
  git pull origin main

  echo "[2/4] Instalando dependencias..."
  cd backend && source .venv/bin/activate
  pip install -r requirements.txt -q

  echo "[3/4] Migraciones..."
  DATABASE_URL="$DB_URL" alembic upgrade head

  echo "[4/4] Rebuild frontend y restart..."
  cd ../frontend && npm run build
  systemctl --user restart safpro-staging-api safpro-staging-worker

  echo "Staging actualizado. Verificando..."
  sleep 2
  curl -sf http://localhost:8002/api/v1/health > /dev/null && echo "API OK" || echo "ERROR: API no responde"
ENDSSH

echo "==> Deploy a staging completado. URL: https://staging.safpro.us"
```

---

## Poblar staging con datos de prueba (opcional)

Para probar con datos reales sin tocar la DB de producción:

```bash
# Copiar un subset de usuarios de producción a staging (solo estructura, sin datos sensibles)
# O restaurar un backup de producción en staging:
pg_restore -U apineda -d safpro_staging ~/safpro/storage/backups/safpro_db_YYYY-MM-DD.dump
```

> ⚠️ Solo hacer esto en staging, nunca en producción.

---

## Checklist antes de promover staging → producción

- [ ] Login funciona (email + OAuth + 2FA)
- [ ] Upload de archivo bancario procesa correctamente
- [ ] Dashboard muestra datos correctos
- [ ] PayPal checkout abre y redirige bien (en sandbox)
- [ ] Email de confirmación llega
- [ ] Panel admin accesible
- [ ] `curl https://staging.safpro.us/api/v1/health` devuelve `{"status": "ok"}`
- [ ] No hay errores 500 en los logs: `journalctl --user -u safpro-staging-api -n 50`
