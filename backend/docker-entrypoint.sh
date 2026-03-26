#!/bin/sh
# ── SAFPRO Docker Entrypoint ──────────────────────────────────────────────────
# Ejecutado por ambos servicios (api y worker) antes de su CMD.
#
# Responsabilidades:
#   1. Inicializar el volumen de storage en el primer arranque (seed del KB global)
#   2. Correr migraciones de Alembic (solo cuando RUN_MIGRATIONS=true — el api service)
#
# El worker NO corre migraciones. Ambos comparten el mismo volumen /app/storage.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[entrypoint] Iniciando SAFPRO..."

# ── 1. Seed del KB global en el volumen ──────────────────────────────────────
# El volumen de storage empieza vacío en el primer arranque del VPS.
# Copiamos el KB global desde /app/seeds (baked en la imagen) al volumen.
# En arranques posteriores, el archivo ya existe y no se toca.

mkdir -p /app/storage/uploads \
         /app/storage/processed \
         /app/storage/temp \
         /app/storage/knowledge_bases

if [ ! -f /app/storage/knowledge_bases/knowledge_base_global.json ]; then
    echo "[entrypoint] Inicializando KB global en el volumen..."
    cp /app/seeds/knowledge_base_global.json /app/storage/knowledge_bases/
    echo "[entrypoint] KB global copiado."
else
    echo "[entrypoint] KB global ya presente — sin cambios."
fi

# ── 2. Migraciones de base de datos ──────────────────────────────────────────
# Solo corre cuando RUN_MIGRATIONS=true. El api service lo activa.
# El worker NO debe correr migraciones (evita race conditions al arrancar).

if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "[entrypoint] Corriendo migraciones de Alembic..."
    alembic upgrade head
    echo "[entrypoint] Migraciones completadas."
fi

echo "[entrypoint] Listo. Arrancando: $@"
exec "$@"
