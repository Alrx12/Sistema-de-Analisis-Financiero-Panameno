# SAFPRO — Sistema de Análisis Financiero

> Analiza tus estados de cuenta bancarios automáticamente. SAFPRO categoriza cada transacción, calcula tus KPIs mensuales y aprende de tus correcciones para mejorar con el tiempo.

---

## ¿Qué es SAFPRO y para qué sirve?

¿Alguna vez terminaste el mes sin saber en qué gastaste el dinero? SAFPRO resuelve eso.

Le das tu estado de cuenta del banco y él te dice, sin que hagas nada manual, cuánto ganaste, cuánto gastaste, y exactamente en qué — comida, suscripciones, transporte, lo que sea. Todo guardado en tu propia base de datos, sin depender de apps de terceros que piden tus claves bancarias.

**La ventaja que lo hace diferente: aprende contigo.** La primera vez va a cometer errores — no sabe si "TRESCUATES-4187" es un restaurante o una ferretería. Tú lo corriges una sola vez, y desde ese momento lo recuerda para siempre. Con el tiempo categoriza casi todo solo, y puedes medir exactamente si está mejorando o no.

**El flujo completo, paso a paso:**

1. Subes el Excel de tu banco (Banco General, BAC o Banistmo)
2. El sistema detecta automáticamente de qué banco es — si ya lo subiste antes, te avisa en lugar de procesarlo dos veces
3. Extrae todas las transacciones
4. Clasifica cada una (¿comida? ¿transporte? ¿suscripción?) usando su motor de categorización
5. Calcula los números: cuánto entró, cuánto salió, en qué categorías
6. Guarda todo en la base de datos
7. Puedes ver cuáles transacciones quedaron mal categorizadas
8. Corriges las que están mal — el sistema aprende y no vuelve a equivocarse con eso
9. Puedes ver y limpiar todo lo que el sistema ha aprendido
10. Puedes medir si está mejorando: si el porcentaje de "no sé qué es esto" baja con el tiempo, el entrenamiento está funcionando

---

## Stack tecnológico

| Componente | Versión | Para qué sirve |
|---|---|---|
| FastAPI | 0.135.1 | Framework de la API REST |
| slowapi | 0.1.9 | Rate limiting en auth endpoints |
| SQLAlchemy | 2.0.48 | ORM (estilo `Mapped[]`) |
| pydantic-settings | 2.13.1 | Lee las variables del .env |
| PyJWT | 2.12.1 | Genera y verifica JWT |
| pwdlib | 0.3.0 | Hashing de passwords |
| alembic | 1.18.4 | Migraciones de la DB |
| openpyxl | 3.1.5 | Leer archivos .xlsx |
| pandas | 3.0.1 | Procesar filas del Excel |
| celery + redis | 5.6.2 / 7.3.0 | Procesamiento asíncrono de uploads |
| uvicorn | 0.42.0 | Servidor HTTP |
| Python | 3.12+ | |

**Frontend:** React + Vite + TypeScript + shadcn/ui + Tailwind CSS

---

## Instalación y arranque

### Requisitos previos

- Python 3.12+
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
# Editar .env con tus valores (ver sección Variables de entorno)

# 4. Aplicar migraciones
alembic upgrade head

# 5. Arrancar el servidor de la API
uvicorn app.main:app --reload --port 8001
# Swagger UI en: http://127.0.0.1:8001/docs

# 6. Arrancar el worker Celery (terminal separada)
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
# IMPORTANTE: el worker NO se recarga automáticamente con --reload
# Si cambias código del pipeline, hay que reiniciarlo manualmente
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000 (proxy → backend en :8001)
npm run build   # build de producción
```

### Desarrollo local con Docker (PostgreSQL + Redis)

Para levantar la base de datos y Redis sin instalarlos nativamente:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esto levanta PostgreSQL en el puerto 5432 y Redis en el 6379.

---

## Variables de entorno

Crea `backend/.env` basándote en `backend/.env.example`:

```env
APP_NAME=SAFPRO API
APP_VERSION=0.1.0
DEBUG=true                          # true: errores detallados + token en forgot-password response
DATABASE_URL=postgresql+psycopg://usuario:contraseña@localhost:5432/safpro
SECRET_KEY=genera-una-clave-larga-y-aleatoria
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440    # JWT dura 24 horas
UPLOAD_DIR=storage/uploads
PROCESSED_DIR=storage/processed
TEMP_DIR=storage/temp
KNOWLEDGE_BASES_DIR=storage/knowledge_bases
REDIS_URL=redis://localhost:6379/0
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx   # Para emails de reset de password (resend.com)
EMAIL_FROM=SAFPRO <noreply@tudominio.com>
FRONTEND_URL=http://localhost:3000
```

### Para producción

```env
DEBUG=false              # Activa: rate limiting, errores genéricos, email real en forgot-password
SECRET_KEY=<clave larga y aleatoria — nunca uses la default>
DATABASE_URL=postgresql+psycopg://usuario:contraseña@localhost:5432/safpro
REDIS_URL=redis://localhost:6379/0
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=SAFPRO <noreply@tudominio.com>
FRONTEND_URL=https://tu-dominio.com
```

**Rate limiting automático con `DEBUG=false`:**
- `POST /auth/login` → 10 intentos/minuto por IP
- `POST /auth/forgot-password` → 5 intentos/minuto por IP
- `POST /auth/register` → 10 intentos/minuto por IP

---

## Tests

```bash
# Todos los tests unitarios e integración (no requieren infra real)
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
| `tests/unit/test_parsers.py` | 5 |
| `tests/services/test_financial_classifier.py` | 12 |
| `tests/services/test_analysis_service.py` | 7 |
| `tests/services/test_detail_normalizer.py` | 32 |
| `tests/api/` (varios archivos) | 45 |
| `tests/services/test_recommendation_engine.py` | 31 |
| `tests/integration/test_files_upload_api.py` | 8 |
| `tests/e2e/test_celery_e2e.py` | 7 |
| **TOTAL** | **183 passed** |

---

## Migraciones de base de datos

```bash
alembic upgrade head                                      # aplicar todas las pendientes
alembic revision --autogenerate -m "descripcion"          # crear una nueva
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

---

## Arquitectura

### Flujo completo de un upload

```
PASO 1: Usuario sube archivo
POST /api/v1/files/upload  →  HTTP 202  {status: "queued", job_id: "..."}
  ├── Valida que sea Excel válido
  ├── Computa SHA-256 del contenido
  │     └── si ya existe → HTTP 409 {error: "duplicate_file"}
  ├── Guarda en storage/temp/
  ├── Crea registro en processing_jobs (status="queued")
  └── Encola tarea en Celery → retorna INMEDIATAMENTE

PASO 2: Worker Celery procesa en background
  ├── Detecta el banco por estructura del Excel (BG / BAC / Banistmo)
  ├── Parsea transacciones
  ├── Detecta o crea la cuenta bancaria (por fingerprint)
  ├── Categoriza cada transacción:
  │     KB personal → KB global → builtins → fallback
  ├── Calcula KPIs: total_income, total_expenses, balance, categorías
  ├── Guarda snapshot y transacciones en DB
  └── Job → status="success"

PASO 3: Usuario consulta resultados
GET /api/v1/jobs/{job_id}
GET /api/v1/analysis
GET /api/v1/analysis/{snapshot_id}
GET /api/v1/analysis/{snapshot_id}/transactions
```

### Mapa de archivos

**API (`app/api/v1/`)**

| Archivo | Endpoints | Qué hace |
|---|---|---|
| `auth.py` | POST /register, /login, /forgot-password, /reset-password, /change-password | Autenticación y cuentas |
| `files.py` | POST /upload | Recibe Excel, deduplicación SHA-256, encola en Celery |
| `accounts.py` | GET/POST/PUT/DELETE /accounts | CRUD de cuentas bancarias |
| `users.py` | GET /me, GET/PUT /profile | Datos del usuario y perfil financiero |
| `jobs.py` | GET /jobs/, GET /jobs/{id} | Estado e historial de uploads |
| `analysis.py` | GET /analysis, GET /analysis/{id}, GET /analysis/{id}/transactions, GET /analysis/aggregated | Análisis y transacciones |
| `kb.py` | GET /kb, GET /kb/global, DELETE /kb/{key}, GET /kb/preview | Knowledge Base |
| `transactions.py` | POST /learn, GET /review-groups, POST /review-groups/apply | Aprendizaje y entrenamiento masivo |
| `health.py` | GET /health | Ping de salud |

**Servicios (`app/services/`)**

| Archivo | Qué hace |
|---|---|
| `processing_service.py` | Orquestador principal del pipeline |
| `financial_classifier.py` | Motor de categorización (KB personal → global → builtins → fallback) |
| `detail_normalizer.py` | Limpia descriptores bancarios crudos → claves canónicas |
| `analysis_service.py` | Calcula KPIs, guarda snapshots y transacciones |
| `recommendation_engine.py` | 10 reglas de recomendación financiera |
| `feature_engineering_service.py` | Features: velocidad de gasto, concentración de merchants, recurrencia |
| `account_detection_service.py` | Detecta o crea cuentas bancarias por fingerprint |
| `transaction_service.py` | Reclasificación de transacciones |

**Parsers (`app/parsers/`)**

| Archivo | Banco | Estado |
|---|---|---|
| `banco_general.py` | Banco General | ✅ Validado con archivo real |
| `bac.py` | BAC Credomatic | ✅ Validado con archivo real |
| `banistmo.py` | Banistmo | ✅ Validado con archivo real |
| `factory.py` | — | Puntúa los 3 parsers, elige el de mayor score (mínimo 0.3) |

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

El `detail_normalizer` convierte descriptores bancarios crudos en claves canónicas para que el KB pueda matchear independientemente del ruido:

| Descriptor raw | Clave canónica |
|---|---|
| `DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680` | `SPOTIFY` |
| `SPOTIFY-4187-94XX-XXXX-6798` | `SPOTIFY` |
| `TRESCUATES-4187-94XX-XXXX-6798` | `TRESCUATES` |
| `SUBWAY VILLA LUCRE 201-4187-94XX-XXXX-6798` | `SUBWAY` |
| `GOOGLE CRU-4187-94XX-XXXX-6798` | `CRUNCHYROLL` |
| `GOOGLE MOB` | `GOOGLE MOB` (sufijo preservado) |

### Taxonomía de categorías

El sistema usa **5 campos** para clasificar cada transacción:

**`economic_type`** — 6 valores: `ingreso`, `gasto`, `cargo_financiero`, `transferencia_propia`, `transferencia_tercero`, `reembolso`

**`economic_type_detail`** — granular: `salario`, `otros_ingresos`, `gasto_variable`, `gasto_recurrente`, `comision`, `impuesto`, `cargo_bancario`, `transferencia_propia`, `transferencia_tercero`, `reembolso`

**`subtype_economic`** — auto-detectado por frecuencia: 3+ ocurrencias del mismo merchant → `recurrente`; 1–2 → `extraordinario`

**`budget_role`** — 7 valores: `presupuestable`, `no_presupuestable`, `gasto_operativo`, `gasto_financiero`, `ahorro_inversion`, `solo_balance`, `revisar`. Solo `solo_balance` se excluye de los totales de income/expenses.

**`budget_category`** — categoría semántica: restaurantes, supermercados, transporte, suscripciones, etc.

### Patrones builtin más importantes

| Patrón en el detalle | economic_type | budget_role |
|---|---|---|
| `ENTRE CUENTAS` | `transferencia_propia` | `solo_balance` |
| `PLANILLA`, `SALARIO`, `NOMINA`, `PAYROLL` | `ingreso` | `presupuestable` |
| `^YAPPY BG DE` (recibir) | `ingreso` | `presupuestable` |
| `^YAPPY BG A`, `^PAGO YAPPY BG A` (enviar) | `transferencia_tercero` | `revisar` |
| `COMISION`, `CARGO ANUAL` | `cargo_financiero` | `gasto_financiero` |
| `ITBMS` | `cargo_financiero` | `gasto_financiero` |
| `CR DEVOLUCION`, `REVERSO` | `reembolso` | `solo_balance` |

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

`detail_learned` muestra la clave canónica que quedó guardada. Si el merchant es global (UBER, NETFLIX, etc.) y `force_personal=false`, el sistema lo guarda en el KB global para beneficio de todos los usuarios.

---

## Auth — Endpoints de autenticación

| Endpoint | Método | Body | Notas |
|---|---|---|---|
| `/auth/register` | POST | JSON: email, password, full_name | Crea cuenta nueva |
| `/auth/login` | POST | Form: username, password | `application/x-www-form-urlencoded`. Devuelve JWT |
| `/auth/forgot-password` | POST | JSON: email | `DEBUG=true` devuelve token en el response; producción envía email |
| `/auth/reset-password` | POST | JSON: token, new_password | TTL de 15 minutos |
| `/auth/change-password` | POST | JSON: current_password, new_password | Requiere Bearer token |
| `/users/me` | GET | — | Requiere Bearer token |

---

## Frontend

**Páginas disponibles:**

| Ruta | Descripción |
|---|---|
| `/` | Dashboard con KPIs, gráficas de tendencia, top merchants y recomendaciones |
| `/upload` | Drag & drop para subir estados de cuenta con polling de progreso |
| `/analysis` | Lista de análisis con info del banco |
| `/analysis/:id` | Detalle: KPIs, donut chart de categorías, recomendaciones |
| `/analysis/:id/transactions` | Transacciones con filtros y reclasificación inline |
| `/kb` | Knowledge Base personal (editable) y global (read-only) |
| `/budget` | Presupuesto 50/30/20 con gastos adicionales manuales |
| `/retrain` | Entrenamiento masivo: reclasifica grupos de transacciones por merchant |
| `/onboarding` | Configuración inicial (industria, ingreso esperado, metas financieras) |

**UI:** Estilo Zoho Invoice — sidebar navy `#1c2b4b`, acento naranja `#e05c19`, cards blancas, animaciones staggered.

---

## Decisiones de diseño

- **Parser detection por estructura, nunca por nombre de archivo.** El banco se detecta por la estructura interna del Excel, no por el nombre del archivo ni por el contenido de las transacciones.

- **El KB guarda claves canónicas, no descriptores raw.** "TRESCUATES" en el KB matchea cualquier versión sucia del descriptor (con número de tarjeta, con ID de referencia, con cualquier ruido bancario).

- **Deduplicación por SHA-256 sobre bytes del archivo.** Evita reprocesar el mismo archivo aunque se renombre. El hash se registra en `uploaded_files` solo tras un pipeline exitoso — si el job falla, el usuario puede reintentar sin recibir un falso 409.

- **Las transacciones se persisten en `analysis_transactions`, no en el JSON del snapshot.** `analysis_snapshots.summary` guarda solo KPIs agregados. Esto evita problemas de serialización y permite queries eficientes.

- **`requires_review` es un campo calculado.** No existe en la DB. Si `confidence < 0.8` → `requires_review=true`.

- **Un solo archivo = una sola cuenta.** Si el Excel tiene transacciones de dos cuentas distintas, el pipeline lo rechaza con HTTP 422.

- **`solo_balance` se excluye de `categories` además de los totales.** Las transferencias entre cuentas propias no son ni ingreso ni gasto real.

- **`GET /analysis` usa batch-query para evitar N+1.** Un solo `SELECT IN (...)` por página para cargar datos de cuentas bancarias asociadas.

- **Los nombres de categoría se normalizan quitando acentos.** Evita que "alimentación" y "alimentacion" generen dos claves distintas en el dict de categorías.

---

## Scripts de utilidad

```bash
# Sembrar KB personal desde datos legacy de otro usuario
python scripts/seed_personal_kb.py <uuid-del-usuario>
python scripts/seed_personal_kb.py <uuid> --force   # sobreescribir si ya existe
```

---

## Licencia

Uso privado.
