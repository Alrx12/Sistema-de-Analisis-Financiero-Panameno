# SAFPRO — Sistema de Análisis Financiero

> Analiza tus estados de cuenta bancarios automáticamente. SAFPRO categoriza cada transacción, calcula tus KPIs mensuales, aprende de tus correcciones y te ayuda a cumplir tu presupuesto personal.

🌐 **[safpro.us](https://safpro.us)**

---

## ¿Qué es SAFPRO?

¿Alguna vez terminaste el mes sin saber en qué gastaste el dinero? SAFPRO resuelve eso.

Le das tu estado de cuenta del banco y él te dice, sin que hagas nada manual, cuánto ganaste, cuánto gastaste, y exactamente en qué — comida, suscripciones, transporte, lo que sea. Todo guardado en tu propia base de datos, **sin depender de apps de terceros que piden tus claves bancarias**.

**La ventaja que lo hace diferente: aprende contigo.** La primera vez va a cometer errores — no sabe si "TRESCUATES-4187" es un restaurante o una ferretería. Tú lo corriges una sola vez, y desde ese momento lo recuerda para siempre. Con el tiempo categoriza casi todo solo, y puedes medir exactamente si está mejorando o no.

---

## Características principales

- **Parseo automático de estados de cuenta** — soporta 5 bancos panameños: Banco General, BAC Credomatic, Banistmo, Banesco y Credicorp Bank
- **Detección de banco por estructura del Excel** — nunca por nombre de archivo ni por contenido de transacciones
- **Deduplicación SHA-256** — el sistema detecta si ya subiste el mismo archivo antes
- **Motor de categorización con Knowledge Base** — KB personal + KB global compartido, aprende de tus correcciones
- **Entrenamiento masivo** — reclasifica grupos de transacciones del mismo merchant de una sola vez
- **Presupuesto personalizado 50/30/20** — metas ajustadas según dependientes, tipo de vivienda, tipo de empleo, deudas activas e industria
- **Gastos manuales** — registra gastos en efectivo o de cuentas sin Excel disponible
- **Wallets y metas de ahorro** — gestiona billeteras virtuales y haz seguimiento de tus metas de ahorro
- **Simulaciones financieras** — runway, escenarios "¿qué pasa si...?", estacionalidad y planificador de quincena
- **Recomendaciones financieras automáticas** — 10 reglas basadas en patrones detectados en tus datos
- **Auth completo** — registro, login, 2FA TOTP, OAuth con Google y GitHub, verificación de email
- **Panel de administración** — métricas de uso, gestión de usuarios y jobs fallidos (solo admin)
- **Plan Pro** — uploads ilimitados y acceso completo a todas las funcionalidades

---

## Bancos soportados

| Banco | Formato | Estado |
|---|---|---|
| Banco General | XLSX (estado de cuenta) | ✅ |
| Banco General | XLSX (últimos movimientos) | ✅ |
| BAC Credomatic | XLSX | ✅ |
| Banistmo | XLSX (estado de cuenta) | ✅ |
| Banistmo | XLSX (movimientos ACH/transferencias) | ✅ |
| Banesco | XLS/OOXML | ✅ |
| Credicorp Bank | XLS (formato sparse 30 columnas) | ✅ |

---

## Stack tecnológico

### Backend

| Componente | Versión | Para qué sirve |
|---|---|---|
| FastAPI | 0.135.1 | Framework de la API REST |
| SQLAlchemy | 2.0.48 | ORM (estilo `Mapped[]`) |
| alembic | 1.18.4 | Migraciones de la DB |
| PyJWT | 2.12.1 | Genera y verifica JWT |
| pwdlib | 0.3.0 | Hashing de passwords |
| slowapi | 0.1.9 | Rate limiting en auth endpoints |
| celery + redis | 5.6.2 / 7.3.0 | Procesamiento asíncrono de uploads |
| openpyxl | 3.1.5 | Leer archivos .xlsx |
| pandas | 3.0.1 | Procesar filas del Excel |
| xlrd | — | Leer archivos .xls (Banesco/Credicorp) |
| pyotp | — | 2FA TOTP (Google Authenticator) |
| uvicorn | 0.42.0 | Servidor HTTP |
| Python | 3.10+ | |

### Frontend

| Componente | Para qué sirve |
|---|---|
| React 19 + Vite + TypeScript | SPA principal |
| Tailwind CSS + shadcn/ui | Estilos y componentes |
| Zustand | Estado global (auth) |
| TanStack Query | Data fetching y caché |
| React Router v7 | Navegación |
| Recharts | Gráficas (tendencia, donut, barras) |

**UI:** Estilo Zoho Invoice — sidebar navy `#1c2b4b`, acento naranja `#e05c19`, cards blancas, animaciones staggered.

---

## Instalación y arranque

### Requisitos previos

- Python 3.10+
- PostgreSQL 15+
- Redis 7+
- Node.js 20+

### Backend

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd Sistema_de_Analisis_Financiero/backend

# 2. Crear entorno virtual e instalar dependencias
python -m venv .venv
source .venv/bin/activate       # Linux/Mac
# .venv\Scripts\activate        # Windows

pip install -r requirements.txt

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Aplicar migraciones
alembic upgrade head

# 5. Arrancar el servidor de la API
uvicorn app.main:app --reload --port 8001
# Swagger UI en: http://127.0.0.1:8001/docs

# 6. Arrancar el worker Celery (terminal separada)
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
# IMPORTANTE: el worker NO se recarga automáticamente
# Si cambias código del pipeline, reinícialo manualmente
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000 (proxy → backend en :8001)
npm run build   # build de producción
```

### Desarrollo local con Docker (PostgreSQL + Redis)

```bash
docker compose -f docker-compose.dev.yml up -d
# Levanta PostgreSQL en 5432 y Redis en 6379
```

---

## Variables de entorno

Crea `backend/.env` basándote en `backend/.env.example`:

```env
APP_NAME=SAFPRO API
APP_VERSION=0.1.0
DEBUG=true                          # true: errores detallados + token en forgot-password response
DATABASE_URL=postgresql+psycopg://usuario:contraseña@localhost:5432/safpro
SECRET_KEY=genera-una-clave-larga-y-aleatoria-de-al-menos-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480     # JWT dura 8 horas
UPLOAD_DIR=storage/uploads
PROCESSED_DIR=storage/processed
TEMP_DIR=storage/temp
KNOWLEDGE_BASES_DIR=storage/knowledge_bases
REDIS_URL=redis://localhost:6379/0
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx   # Obtén en resend.com
EMAIL_FROM=SAFPRO <noreply@tudominio.com>
FRONTEND_URL=http://localhost:3000

# OAuth (opcional — para login con Google/GitHub)
GOOGLE_CLIENT_ID=tu-client-id
GOOGLE_CLIENT_SECRET=tu-client-secret
GITHUB_CLIENT_ID=tu-client-id
GITHUB_CLIENT_SECRET=tu-client-secret

# PayPal (opcional — para cobros)
PAYPAL_CLIENT_ID=tu-client-id
PAYPAL_CLIENT_SECRET=tu-client-secret
PAYPAL_SANDBOX=true
```

### Para producción

```env
DEBUG=false              # Activa rate limiting, errores genéricos, email real
SECRET_KEY=<clave larga aleatoria — mínimo 32 caracteres>
DATABASE_URL=postgresql+psycopg://usuario:contraseña@localhost:5432/safpro
FRONTEND_URL=https://tu-dominio.com
```

**Rate limiting automático con `DEBUG=false`:**
- `POST /auth/login` → 10 intentos/minuto por IP
- `POST /auth/forgot-password` → 5 intentos/minuto por IP
- `POST /auth/register` → 10 intentos/minuto por IP

---

## Tests

```bash
# Todos los tests (unitarios + integración)
python -m pytest -q

# Solo unitarios
python -m pytest tests/unit/ -q

# Un archivo específico
python -m pytest tests/unit/test_parsers.py -q

# Tests E2E (requieren API + Redis + Celery + PostgreSQL corriendo)
python -m pytest tests/e2e/test_celery_e2e.py -v -m e2e
```

| Módulo | Tests |
|---|---|
| `tests/unit/test_financial_classifier.py` | 38 |
| `tests/unit/test_parsers.py` | 12 |
| `tests/services/test_financial_classifier.py` | 12 |
| `tests/services/test_analysis_service.py` | 7 |
| `tests/services/test_detail_normalizer.py` | 32 |
| `tests/api/` (varios archivos) | 45 |
| `tests/services/test_recommendation_engine.py` | 31 |
| `tests/integration/test_files_upload_api.py` | 8 |
| `tests/e2e/test_celery_e2e.py` | 7 |
| **TOTAL** | **~190 passed** |

---

## Migraciones de base de datos

```bash
alembic upgrade head                                  # aplicar todas las pendientes
alembic revision --autogenerate -m "descripcion"      # crear una nueva
```

| Revisión | Descripción |
|---|---|
| `aee0d9a03b5b` | Tablas base: users, bank_accounts, uploaded_files |
| `74c3709235b6` | processing_jobs, analysis_snapshots |
| `b91e024a922a` | original_filename y file_type en processing_jobs |
| `c4f9e2a1d8ab` | analysis_transactions |
| `d7e3f1a2b9c4` | Agrega `economic_type_detail`, elimina `transaction_category` |
| `e5b3f8a2c1d9` | Agrega `bank_account_id` (FK nullable) a analysis_snapshots |
| `f6a1b2c3d4e5` | Tabla `user_profiles`: industry, income, financial_goals, onboarding |
| `g7b4c9d2e1f6` | Agrega `manual_expenses` (JSON) a user_profiles |
| `h8c5d3e1f2a7` | Tablas `manual_wallets` y `savings_goals` |
| `i9d6e4f3g2h1` | Agrega `available_balance` a bank_accounts |
| `j0e7f5g4h3i2` | Auth extendida: is_verified, totp_secret, totp_enabled, OAuth fields |
| `k1f8g6h5i4j3` | Agrega campo `plan` a users (free / pro / friends_and_family) |
| `l2g9h7i6j5k4` | Agrega `is_admin` e `is_suspended` a users |
| `m3h0i8j7k6l5` | Presupuesto personalizado: dependents_count, housing_type, employment_type, etc. |
| `n4i1j9k8l7m6` | Billing: stripe_customer_id, subscription_expires_at |
| `o5j2k0l9m8n7` | Agrega `user_reclassified` a analysis_transactions |
| `p6k3l1m0n9o8` | Agrega `dlocalgo_subscription_id` a users |
| `q7l4m2n1o0p9` | Agrega `paypal_subscription_id` a users |
| `s9t6u4v3w2x1` | NO FORCE RLS en 9 tablas |

---

## Arquitectura

### Flujo completo de un upload

```
PASO 1: Usuario sube archivo
POST /api/v1/files/upload  →  HTTP 202  {status: "queued", job_id: "..."}
  ├── Verifica límite de uploads según plan (free: 5, pro: ilimitado)
  ├── Computa SHA-256 del contenido
  │     └── si ya existe → HTTP 409 {error: "duplicate_file"}
  ├── Guarda en storage/temp/
  ├── Crea registro en processing_jobs (status="queued")
  └── Encola tarea en Celery → retorna INMEDIATAMENTE

PASO 2: Worker Celery procesa en background
  ├── Detecta el banco por estructura del Excel (7 parsers)
  ├── Parsea transacciones
  ├── Detecta o crea la cuenta bancaria (por fingerprint)
  ├── Categoriza cada transacción:
  │     KB personal → KB global → builtins → fallback
  ├── Calcula KPIs: total_income, total_expenses, balance, categorías
  ├── Aplica auto-detección de subtype por frecuencia
  ├── Guarda snapshot y transacciones en DB
  └── Job → status="success"

PASO 3: Usuario consulta resultados
GET /api/v1/jobs/{job_id}
GET /api/v1/analysis
GET /api/v1/analysis/{snapshot_id}
GET /api/v1/analysis/{snapshot_id}/transactions
```

### Mapa de API (`app/api/v1/`)

| Archivo | Endpoints | Qué hace |
|---|---|---|
| `auth.py` | POST /register, /login, /forgot-password, /reset-password, /change-password, /verify-email, /auth/google, /auth/github, /auth/2fa/setup, /auth/2fa/enable, /auth/2fa/disable, /auth/2fa/verify | Auth completo: cuentas, contraseñas, OAuth, 2FA TOTP, verificación de email |
| `files.py` | POST /upload, GET /uploads/status | Recibe Excel, deduplicación SHA-256, encola en Celery, estado de uploads |
| `accounts.py` | GET/POST/PUT/DELETE /accounts | CRUD de cuentas bancarias |
| `users.py` | GET /me, PATCH /users/me | Datos del usuario y cambio de nombre |
| `profile.py` | GET/PUT /users/profile | Perfil financiero (industria, ingreso, metas, presupuesto personalizado) |
| `jobs.py` | GET /jobs/, GET /jobs/{id} | Estado e historial de uploads |
| `analysis.py` | GET /analysis, GET /analysis/{id}, GET /analysis/{id}/transactions, GET /analysis/{id}/confidence-stats, GET /analysis/{id}/features, POST /analysis/{id}/reclassify-bulk, GET /analysis/aggregated | Análisis, transacciones, KPIs de confianza, features de ML, re-categorización bulk |
| `kb.py` | GET /kb, GET /kb/global, DELETE /kb/{key}, GET /kb/preview | Knowledge Base personal y global |
| `transactions.py` | POST /learn, GET /review-groups, POST /review-groups/apply | Aprendizaje individual y entrenamiento masivo |
| `wallets.py` | GET/POST/PUT/DELETE /wallets | CRUD de billeteras manuales |
| `goals.py` | GET/POST/PUT/DELETE /goals, POST /goals/{id}/deposit, POST /goals/{id}/withdraw | Metas de ahorro |
| `manual_transactions.py` | POST /manual-transactions | Entrada manual de gastos en efectivo |
| `billing.py` | POST /billing/create-checkout-session, POST /billing/paypal/webhook, GET /billing/portal, GET /billing/status | Billing via PayPal Subscriptions |
| `admin.py` | GET/POST/PATCH/DELETE /admin/users/*, GET /admin/jobs, GET /admin/analytics | Panel de administración (requiere is_admin=true) |
| `contact.py` | POST /contact | Formulario de contacto público |
| `health.py` | GET /health, HEAD /health | Ping de salud |

### Servicios (`app/services/`)

| Archivo | Qué hace |
|---|---|
| `processing_service.py` | Orquestador principal del pipeline |
| `financial_classifier.py` | Motor de categorización (KB personal → global → builtins → fallback) |
| `detail_normalizer.py` | Limpia descriptores bancarios crudos → claves canónicas |
| `analysis_service.py` | Calcula KPIs, guarda snapshots y transacciones |
| `recommendation_engine.py` | 10 reglas de recomendación financiera personalizadas |
| `feature_engineering_service.py` | Features: velocidad de gasto, concentración de merchants, recurrencia |
| `account_detection_service.py` | Detecta o crea cuentas bancarias por fingerprint |
| `transaction_service.py` | Reclasificación de transacciones individuales y en bulk |
| `billing_service.py` | Integración PayPal (Plan A) y dLocal Go (Plan B legacy) |
| `email_service.py` | Envío de emails vía Resend: reset, verificación, alertas admin |
| `analytics_service.py` | Tracking de eventos de producto (fire-and-forget) |
| `profile_service.py` | CRUD del perfil de usuario |
| `auth_service.py` | Registro, 2FA TOTP, OAuth, verificación de email |

### Parsers (`app/parsers/`)

| Archivo | Banco | Formato |
|---|---|---|
| `banco_general.py` | Banco General | XLSX estado de cuenta |
| `banco_general_movimientos.py` | Banco General | XLSX últimos movimientos (BGPExcelReport) |
| `bac.py` | BAC Credomatic | XLSX |
| `banistmo.py` | Banistmo | XLSX estado de cuenta |
| `banistmo_movimientos.py` | Banistmo | XLSX movimientos ACH/transferencias |
| `banesco.py` | Banesco | XLS/OOXML (usa openpyxl aunque extensión sea .xls) |
| `credicorp.py` | Credicorp Bank | XLS sparse 30 columnas |
| `factory.py` | — | Puntúa todos los parsers, elige el de mayor score (mínimo 0.3) |

> **Regla crítica:** La detección del banco es SIEMPRE por estructura del Excel (columnas, headers, metadatos). Nunca por nombre del archivo ni por contenido de las transacciones.

---

## Motor de categorización

### Orden de búsqueda (se detiene en el primer match)

| Paso | Qué revisa | Confidence |
|---|---|---|
| 0 | ¿El nombre del usuario aparece en el detalle? → transferencia propia | 1.0 |
| 0b | ¿Dice "ACH" o "XPRESS" sin nombre del usuario? → transferencia tercero | 0.85 |
| 1 | ¿Clave canónica en KB personal? | 1.0 |
| 2 | ¿Patrón regex en KB personal? | 0.92 |
| 3 | ¿Clave canónica en KB global? | 1.0 |
| 4 | ¿Patrón regex en KB global? | 0.90 |
| 5 | ¿Patrón builtin hardcodeado? | 0.90–0.95 |
| 6 | Fallback por tipo de movimiento | 0.3 |

Las transacciones con `confidence < 0.8` tienen `requires_review=true` (campo calculado, no existe en DB).

### Normalización de descriptores

El `detail_normalizer` convierte descriptores bancarios crudos en claves canónicas:

| Descriptor raw | Clave canónica |
|---|---|
| `DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680` | `SPOTIFY` |
| `SPOTIFY-4187-94XX-XXXX-6798` | `SPOTIFY` |
| `TRESCUATES-4187-94XX-XXXX-6798` | `TRESCUATES` |
| `SUBWAY VILLA LUCRE 201-4187-94XX-XXXX-6798` | `SUBWAY` |
| `GOOGLE CRU-4187-94XX-XXXX-6798` | `CRUNCHYROLL` |
| `GOOGLE MOB` | `GOOGLE MOB` (sufijo preservado) |
| `YAPPY BG A JUAN PEREZ` | `JUAN PEREZ` (destinatario extraído) |
| `MC DON` | `MCDONALDS` (formato truncado Banistmo) |

### Taxonomía de categorías

El sistema usa **5 campos** para clasificar cada transacción:

**`economic_type`** — 6 valores: `ingreso`, `gasto`, `cargo_financiero`, `transferencia_propia`, `transferencia_tercero`, `reembolso`

**`economic_type_detail`** — granular: `salario`, `otros_ingresos`, `gasto_variable`, `gasto_recurrente`, `comision`, `impuesto`, `cargo_bancario`, `transferencia_propia`, `transferencia_tercero`, `reembolso`

**`subtype_economic`** — auto-detectado por frecuencia: 3+ ocurrencias del mismo merchant → `recurrente`; 1–2 → `extraordinario`

**`budget_role`** — 7 valores: `presupuestable`, `no_presupuestable`, `gasto_operativo`, `gasto_financiero`, `ahorro_inversion`, `solo_balance`, `revisar`. Solo `solo_balance` se excluye de los totales de income/expenses.

**`budget_category`** — categoría semántica: restaurantes, supermercados, transporte, suscripciones, etc.

---

## Auth — Endpoints de autenticación

| Endpoint | Método | Descripción |
|---|---|---|
| `/auth/register` | POST | Crea cuenta nueva, envía email de verificación |
| `/auth/login` | POST | Login con email/password (`application/x-www-form-urlencoded`) |
| `/auth/forgot-password` | POST | Envía email de reset (en `DEBUG=true` retorna token en response) |
| `/auth/reset-password` | POST | Restablece password con token (TTL 15 min) |
| `/auth/change-password` | POST | Cambia password conociendo el actual |
| `/auth/verify-email` | POST | Verifica email con token recibido por correo |
| `/auth/google` | GET | Inicia flujo OAuth con Google |
| `/auth/github` | GET | Inicia flujo OAuth con GitHub |
| `/auth/2fa/setup` | POST | Genera secret TOTP + QR code para Google Authenticator |
| `/auth/2fa/enable` | POST | Activa 2FA verificando el primer código OTP |
| `/auth/2fa/disable` | POST | Desactiva 2FA verificando el código actual |
| `/auth/2fa/verify` | POST | Segunda fase del login con 2FA activo |

---

## Frontend — Páginas disponibles

| Ruta | Descripción | Acceso |
|---|---|---|
| `/` | Dashboard: KPIs, gráficas de tendencia, top merchants, rol presupuestario | Protegida |
| `/upload` | Drag & drop para subir estados de cuenta con polling de progreso | Protegida |
| `/manual` | Entrada manual de gastos en efectivo con numpad | Protegida |
| `/cuentas` | Gestión de wallets manuales y metas de ahorro | Protegida |
| `/analysis` | Lista de análisis con info del banco | Protegida |
| `/analysis/:id` | Detalle: KPIs, donut chart de categorías, recomendaciones | Protegida |
| `/analysis/:id/transactions` | Transacciones con filtros y reclasificación inline | Protegida |
| `/kb` | Knowledge Base personal (editable) y global (read-only) | Protegida |
| `/budget` | Presupuesto 50/30/20 personalizado: real vs objetivo + gastos adicionales | Protegida (Pro) |
| `/retrain` | Entrenamiento masivo: reclasifica grupos de transacciones por merchant | Protegida (Pro) |
| `/simulaciones` | Runway, escenarios "¿qué pasa si...?", estacionalidad, planificador de quincena | Protegida (Pro) |
| `/upgrade` | Planes Free vs Pro con checkout PayPal | Protegida |
| `/admin` | Panel de administración (solo admins) | Protegida (admin) |
| `/onboarding` | Configuración inicial: industria, ingreso esperado, metas | Protegida |
| `/faq` | Preguntas frecuentes | Pública |
| `/terms` | Términos de servicio | Pública |
| `/privacy` | Política de privacidad (Ley 81 de Panamá) | Pública |
| `/contacto` | Formulario de contacto | Pública |

---

## Presupuesto personalizado

La regla 50/30/20 se ajusta automáticamente según el perfil del usuario:

| Variable del perfil | Efecto en metas |
|---|---|
| Dependientes (hijos, etc.) | +3% en Necesidades por cada dependiente |
| Vivienda propia (sin alquiler) | -5% en Necesidades |
| Empleo variable o independiente | +5% en Ahorro |
| Deudas activas | +3% en Ahorro |
| Industria entretenimiento | +5% en Ahorro (ingresos variables) |

---

## Endpoint /learn — Cómo el sistema aprende

`POST /api/v1/transactions/learn`

```json
{
  "detail": "TRESCUATES-4187-94XX-XXXX-6798",
  "economic_type": "gasto",
  "subtype_economic": "extraordinario",
  "budget_category": "restaurantes",
  "budget_role": "no_presupuestable",
  "weight": 2,
  "force_personal": false
}
```

**Response:**
```json
{
  "message": "KB personal actualizado correctamente.",
  "detail_learned": "TRESCUATES",
  "kb_target": "personal",
  "personal_exact_matches": 2,
  "personal_patterns": 2
}
```

`detail_learned` muestra la clave canónica guardada. Si el merchant es global (UBER, NETFLIX, etc.) y `force_personal=false`, se guarda en el KB global para beneficio de todos los usuarios.

---

## Decisiones de diseño

**Parser detection por estructura, nunca por nombre de archivo.** El banco se detecta por la estructura interna del Excel. "MCD CTE" o "BANCO GENERAL" aparecen como texto en descriptores de Banistmo — usarlos como señal identificaría mal el banco.

**El KB guarda claves canónicas, no descriptores raw.** "TRESCUATES" matchea cualquier versión sucia del descriptor (con número de tarjeta, con ID de referencia, con cualquier ruido bancario).

**Deduplicación por SHA-256 sobre bytes del archivo.** Evita reprocesar el mismo archivo aunque se renombre. El hash se registra en `uploaded_files` solo tras un pipeline exitoso — si el job falla, el usuario puede reintentar sin recibir un falso 409.

**Las transacciones se persisten en `analysis_transactions`, no en el JSON del snapshot.** `analysis_snapshots.summary` guarda solo KPIs agregados. Evita problemas de serialización y permite queries eficientes.

**`requires_review` es un campo calculado.** No existe en la DB. Si `confidence < 0.8` → `requires_review=true`.

**Un solo archivo = una sola cuenta.** Si el Excel tiene transacciones de dos cuentas distintas, el pipeline lo rechaza con HTTP 422.

**`solo_balance` se excluye de `categories` además de los totales.** Las transferencias entre cuentas propias no son ni ingreso ni gasto real.

**`GET /analysis` usa batch-query para evitar N+1.** Un solo `SELECT IN (...)` por página para cargar datos de cuentas bancarias asociadas.

**Banesco exporta OOXML con extensión `.xls`.** `BanescoParser` sobreescribe `load_dataframe` para usar openpyxl en lugar de xlrd cuando la extensión es `.xls`. Los demás parsers reciben score 0.0 en estos archivos.

**`analytics_service.track_event()` es fire-and-forget.** Abre su propia sesión de DB y nunca bloquea el endpoint que lo llama.

---

## Scripts de utilidad

```bash
# Sembrar KB personal desde datos legacy de otro usuario
python scripts/seed_personal_kb.py <uuid-del-usuario>
python scripts/seed_personal_kb.py <uuid> --force   # sobreescribir si ya existe

# Crear planes de PayPal (configuración inicial)
python scripts/setup_paypal_plans.py

# Verificar y corregir jobs atascados en estado "processing"
python scripts/check_stuck_jobs.py --fix --quiet

# Backup de PostgreSQL a Cloudflare R2
bash scripts/backup.sh
```

---

## Contacto

Para soporte: [safpro.us/contacto](https://safpro.us/contacto) · admin@safpro.us

---

## Licencia

Uso privado.
