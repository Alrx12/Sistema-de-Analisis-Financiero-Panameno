# ── SAFPRO Frontend ───────────────────────────────────────────────────────────
# Multi-stage build:
#   Stage 1 (builder): Compila la app React con Vite → genera /app/dist
#   Stage 2 (runtime): nginx sirve /dist como SPA y hace proxy de /api al backend
#
# No se necesita variable de entorno para la URL del backend porque el cliente
# axios usa baseURL: "/api/v1" (relativo). nginx enruta /api/ → api:8001.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias primero (mejor cache — solo re-ejecuta si cambia package*.json)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copiar el resto y compilar
COPY . .
RUN npm run build
# El output queda en /app/dist

# ── Stage 2: Runtime (nginx) ─────────────────────────────────────────────────
FROM nginx:alpine

# Copiar archivos compilados del stage anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de nginx (SPA fallback + proxy de API)
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
