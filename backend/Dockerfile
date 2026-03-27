# ── SAFPRO Backend ────────────────────────────────────────────────────────────
# Imagen compartida para el API server (uvicorn) y el Celery worker.
# La diferencia entre ambos servicios es el CMD — el entrypoint es el mismo.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# Instalar dependencias del sistema que necesita psycopg (cliente de PostgreSQL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias Python primero (mejor cache de capas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY . .

# Crear directorios de storage base (el volumen los sobreescribirá en runtime,
# pero los necesitamos para el paso de seeds)
RUN mkdir -p /app/seeds /app/storage/uploads /app/storage/processed \
             /app/storage/temp /app/storage/knowledge_bases

# Copiar el KB global como seed — se usa en docker-entrypoint.sh para
# inicializar el volumen en el primer arranque
RUN cp storage/knowledge_bases/knowledge_base_global.json /app/seeds/ 2>/dev/null || \
    echo '{"exact_matches": {}, "patterns": []}' > /app/seeds/knowledge_base_global.json

# Entrypoint: maneja seeds de storage y migraciones opcionales
COPY . /app
WORKDIR /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh /entrypoint.sh

RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 8001

ENTRYPOINT ["/entrypoint.sh"]

# CMD default: API server. El worker sobreescribe esto en docker-compose.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
