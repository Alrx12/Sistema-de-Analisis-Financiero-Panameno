# CLAUDE.md — Guía Completa de SAFPRO

**Última actualización:** 2026-03-25 (sesión 14)
**Estado general:** Pipeline E2E validado. Backend completo para MVP. **Frontend en desarrollo activo (sesión 14):** React + Vite + TypeScript + shadcn/ui. Auth completo (login/register/forgot/reset), dashboard, upload + polling, lista/detalle de análisis, transacciones con reclasificación inline. Tests backend 183 passed, 3 warnings.

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

## Comandos — cómo arrancar todo

**Todo se corre desde la carpeta `backend/` con el virtualenv activo (`.venv`).**

```bash
# 1. Arrancar el servidor de la API
uvicorn app.main:app --reload --port 8001
# --reload = se reinicia solo cuando cambias el código
# Swagger UI en: http://127.0.0.1:8001/docs

# 2. Arrancar el worker Celery (proceso separado, otra terminal)
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
# IMPORTANTE: el worker NO se recarga automáticamente con --reload
# Si cambias código del pipeline, hay que matar el worker y volverlo a arrancar

# 3. Tests (no necesitan Redis, Celery ni PostgreSQL reales — usan mocks)
python -m pytest -q                                         # todos (174 tests; e2e requieren infra real)
python -m pytest tests/unit/ -q                             # solo unitarios
python -m pytest tests/unit/test_parsers.py -q              # un archivo
python -m pytest tests/unit/test_parsers.py::nombre_test -v # un test específico

# 4. Tests E2E (SÍ necesitan infra real: API + Redis + Celery + PostgreSQL)
python -m pytest tests/e2e/test_celery_e2e.py -v -m e2e

# 5. Migraciones de base de datos
alembic revision --autogenerate -m "descripcion del cambio"
alembic upgrade head

# 6. Scripts de utilidad
python scripts/seed_personal_kb.py <uuid-del-usuario>       # copiar KB personal de usuario legacy
python scripts/seed_personal_kb.py <uuid> --force           # sobreescribir si ya existe
python scripts/seed_demo.py                                 # datos de prueba
```

---

## Variables de entorno

Crear el archivo `backend/.env` con esto:

```env
APP_NAME=SAFPRO API
APP_VERSION=0.1.0
DEBUG=true                          # En true: muestra errores reales en la API y retorna token en forgot-password
DATABASE_URL=postgresql+psycopg://user:password@host:5432/safpro
SECRET_KEY=clave_segura_larga
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440    # JWT dura 24 horas
UPLOAD_DIR=storage/uploads
PROCESSED_DIR=storage/processed
TEMP_DIR=storage/temp
KNOWLEDGE_BASES_DIR=storage/knowledge_bases
REDIS_URL=redis://localhost:6379/0
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx   # Para emails de reset de password
EMAIL_FROM=SAFPRO <noreply@tudominio.com>
FRONTEND_URL=http://localhost:3000
```

### Para poner en producción (checklist)

Cambia estas variables en `.env`:

```env
DEBUG=false              # ← Activa: rate limiting, errores genéricos, email real en forgot-password
SECRET_KEY=<genera una clave larga y aleatoria — nunca uses la default>
DATABASE_URL=postgresql+psycopg://user:password@host:5432/safpro_prod
REDIS_URL=redis://tu-servidor-redis:6379/0
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx   # Obtén la key en resend.com
EMAIL_FROM=SAFPRO <noreply@tudominio.com>  # El dominio debe estar verificado en Resend
FRONTEND_URL=https://tu-app.tudominio.com  # URL base del frontend para el link de reset
```

**Pasos para Resend:**
1. Crear cuenta en [resend.com](https://resend.com)
2. Ir a Domains → Add Domain → verificar tu dominio (agrega los registros DNS que te pide)
3. Ir a API Keys → Create API Key → copiar y poner en `RESEND_API_KEY`
4. Cambiar `EMAIL_FROM` con el dominio verificado (ej: `SAFPRO <noreply@safpro.tudominio.com>`)

**Rate limiting (automático con `DEBUG=false`):**
- `POST /auth/login` → 10 intentos/minuto por IP
- `POST /auth/forgot-password` → 5 intentos/minuto por IP
- `POST /auth/register` → 10 intentos/minuto por IP
- Los contadores viven en Redis y sobreviven reinicios del servidor

---

## Stack tecnológico

| Componente | Versión | Estado | Para qué sirve |
|---|---|---|---|
| FastAPI | 0.135.1 | ✅ | Framework de la API REST |
| slowapi | 0.1.9 | ✅ | Rate limiting en auth endpoints (activo cuando DEBUG=false) |
| SQLAlchemy | 2.0.48 | ✅ (estilo `Mapped[]`) | ORM para la base de datos |
| pydantic-settings | 2.13.1 | ✅ | Lee las variables del .env |
| PyJWT | 2.12.1 | ✅ | Genera y verifica JWT (`security.py`, `deps.py`) — reemplazó python-jose |
| passlib | 1.7.4 | ⚠️ Sin mantenimiento | Hashing de passwords (legado) |
| pwdlib | 0.3.0 | ✅ | Hashing de passwords (nuevo) — ya adoptado en security.py |
| alembic | 1.18.4 | ✅ | Migraciones de la DB (4 aplicadas) |
| openpyxl | 3.1.5 | ✅ | Leer archivos .xlsx |
| pandas | 3.0.1 | ✅ | Procesar filas del Excel |
| celery + redis | 5.6.2 / 7.3.0 | ✅ | Procesar uploads en background |
| uvicorn | 0.42.0 | ✅ | Servidor HTTP |
| Python | 3.14 | ✅ | Versión en Windows. El VM Linux de Cowork usa Python 3.10 |

---

## Mapa de archivos — qué hace cada uno

### API (`app/api/v1/`)
Estos archivos definen los endpoints HTTP. Reciben requests, llaman servicios, devuelven JSON.

| Archivo | Endpoints | Qué hace |
|---|---|---|
| `auth.py` | POST /register, /login, /forgot-password, /reset-password, /change-password | Todo lo de cuentas de usuario y contraseñas |
| `files.py` | POST /upload | Recibe el archivo Excel, computa SHA-256 para deduplicación (HTTP 409 si ya existe), encola en Celery, retorna job_id inmediatamente (HTTP 202) |
| `accounts.py` | GET/POST/PUT/DELETE /accounts | CRUD de cuentas bancarias del usuario |
| `users.py` | GET /me | Datos del usuario actual |
| `jobs.py` | GET /jobs/, GET /jobs/{id} | Ver el estado y historial de uploads procesados |
| `analysis.py` | GET /analysis, GET /analysis/{id}, GET /analysis/{id}/transactions, GET /analysis/{id}/confidence-stats, GET /analysis/{id}/features, POST /analysis/{id}/reclassify-bulk | Ver análisis (incluye `bank_account` con nombre del banco + last4), transacciones, KPIs de confianza, features de ingeniería financiera, re-categorización bulk |
| `kb.py` | GET /kb, DELETE /kb/{key}, GET /kb/preview | Ver KB personal, borrar una entrada incorrecta, previsualizar clave canónica de un descriptor |
| `transactions.py` | POST /transactions/learn | El usuario corrige una categorización y el sistema aprende |
| `health.py` | GET /health | Ping de salud del servidor |
| `deps.py` | — | Funciones de dependencia: verifica JWT, inyecta sesión de DB |

### Servicios (`app/services/`)
Aquí vive la lógica de negocio. Los endpoints los llaman.

| Archivo | Qué hace |
|---|---|
| `processing_service.py` | **Orquestador principal.** Coordina el pipeline completo: parsear → detectar cuenta → analizar → guardar en DB |
| `file_service.py` | Valida que el archivo sea un Excel válido y lo guarda en temp/ |
| `account_detection_service.py` | Detecta o crea la cuenta bancaria usando un fingerprint (hash de banco + últimos 4 dígitos) |
| `account_service.py` | CRUD de cuentas bancarias usando el repositorio |
| `analysis_service.py` | Calcula KPIs, guarda snapshot y transacciones. Llama a `recommendation_engine` y a `_get_merchant_history` para detección cross-snapshot. |
| `recommendation_engine.py` | **Motor de recomendaciones.** Módulo puro (sin DB). 10 reglas: no_income_detected, expenses_exceed_income, good_savings_rate, top_expense_category, category_concentration, high_bank_charges, high_unknown_spend, recurring_spend_summary, low_confidence_transactions, merchant_price_increase. |
| `feature_engineering_service.py` | **Pipeline de features.** Módulo puro. Recibe transacciones persistidas, devuelve: by_week, by_day_of_week, spending_velocity (curva acumulada + proyección), category_ratios, merchant_concentration (top 10), recurrence_stats, income_stats. |
| `financial_classifier.py` | **Motor de categorización.** Busca en KB personal → KB global → patrones builtin → fallback |
| `detail_normalizer.py` | **Limpia descriptores bancarios.** Convierte raw → clave canónica. |
| `categorization_service.py` | Puente entre el pipeline y el clasificador. |
| `auth_service.py` | Registro de usuarios y verificación de contraseñas |
| `email_service.py` | Envío de email de reset de password vía API de Resend |
| `file_fingerprint_service.py` | Calcula SHA-256. HTTP 409 si el usuario sube el mismo archivo dos veces. |
| `transaction_service.py` | Reclasificación de transacciones: `reclassify_transaction()` actualiza DB y enseña al KB. |

### Parsers (`app/parsers/`)
Cada parser sabe cómo leer el Excel de un banco específico.

| Archivo | Banco | Estado | Score en su propio archivo |
|---|---|---|---|
| `factory.py` | — | ✅ | Puntúa todos los parsers, elige el que tenga score > 0.3 |
| `base.py` | — | ✅ | Clase base con lógica compartida: normalizar montos, parsear fechas, encontrar columnas |
| `banco_general.py` | Banco General | ✅ Validado con archivo real | 1.0 en BG, 0.0 en otros |
| `bac.py` | BAC Credomatic | ✅ Validado con archivo real (35 tx, last4='7909') | 1.0 en BAC, 0.0 en otros |
| `banistmo.py` | Banistmo | ✅ Validado con archivo real (222 tx, last4='9629') | 1.0 en Banistmo, 0.0 en otros |

**Regla crítica de parsers:** La detección del banco es SIEMPRE por estructura del Excel (número de columnas, nombres del header, metadatos). NUNCA por nombre del archivo ni por contenido de las transacciones. "MCD CTE", "DB POS COMPRA", "BANCO GENERAL" aparecen en los descriptores de transacciones de Banistmo — si se usaran como señal, Banistmo sería detectado como Banco General.

### Modelos (`app/models/`)
Representan las tablas de la base de datos.

| Archivo | Tabla | Qué guarda |
|---|---|---|
| `user.py` | `users` | Cuentas de usuario: email, password_hash, nombre |
| `bank_account.py` | `bank_accounts` | Cuentas bancarias detectadas: banco, últimos 4, fingerprint |
| `processing_job.py` | `processing_jobs` | Cada upload: status (queued/processing/success/error), error_message, timestamps |
| `analysis_snapshot.py` | `analysis_snapshots` | KPIs del análisis: total_income, total_expenses, balance, categorías (JSON), period_start/end, **bank_account_id FK → bank_accounts** |
| `analysis_transaction.py` | `analysis_transactions` | Cada transacción individual: fecha, detalle, monto, categorización completa, confidence |
| `uploaded_file.py` | `uploaded_files` | Registro del archivo original subido |
| `transaction.py` | — | **STUB VACÍO / DEPRECATED** |
| `category_override.py` | — | **STUB VACÍO / DEPRECATED** |

### Workers (`app/workers/`)

| Archivo | Qué hace |
|---|---|
| `celery_app.py` | Configura la instancia de Celery (conexión a Redis, configuración de reintentos, TTL de resultados) |
| `tasks.py` | Define `process_file_task`: la tarea que Celery ejecuta en background. Abre su propia conexión a DB, carga el User y ProcessingJob, llama `ProcessingService.run_pipeline()`, reintenta hasta 3 veces si hay error de DB |
| `job_runner.py` | **Archivo vacío (0 bytes). Pendiente de eliminar con `git rm`.** No tiene ningún rol — `tasks.py` es el único worker. |

### Knowledge Bases (`storage/knowledge_bases/`)
Archivos JSON que el clasificador usa para categorizar transacciones.

| Archivo | Qué contiene |
|---|---|
| `knowledge_base_global.json` | KB universal: 165 exact_matches + 44 patrones. Copiado de datos legacy. Guarda claves canónicas como "SPOTIFY", "NETFLIX", "UBER" |
| `knowledge_base_user_{uuid}.json` | KB personal de cada usuario. Se crea y actualiza cuando el usuario usa `/learn`. Las correcciones del usuario se guardan aquí |

**Cómo funciona el KB:** Las claves son strings canónicos (ya normalizados). El clasificador canonicaliza el detalle de la transacción antes de buscarlo. Si "TRESCUATES-4187-94XX-XXXX-6798" se canonicaliza a "TRESCUATES", busca "TRESCUATES" en el KB.

---

## Flujo completo de un upload

```
PASO 1: Usuario sube archivo
POST /api/v1/files/upload  →  HTTP 202  {status: "queued", job_id: "xxxx-..."}
  ├── FileService.validate_upload()          ← verifica que sea Excel válido, no muy grande
  ├── compute_checksum(content)              ← SHA-256 del contenido (O(n) sobre el archivo)
  ├── query uploaded_files WHERE user_id + checksum
  │     └── si existe → HTTP 409 {error: "duplicate_file", original_filename, uploaded_at, detected_bank}
  ├── save_temp_file()                       ← guarda en storage/temp/
  ├── ProcessingService.create_job()         ← crea registro en processing_jobs (status="queued")
  └── process_file_task.delay(..., content_hash, file_size) ← manda la tarea a Redis/Celery
      → retorna INMEDIATAMENTE sin esperar el resultado

PASO 2: Worker Celery procesa en background
process_file_task(file_path, original_filename, user_id, job_id)
  ├── Carga User y ProcessingJob desde DB
  └── ProcessingService.run_pipeline(job, file_path, user)
        ├── Job → status="processing"
        ├── ParserFactory.get_parser(file_path)
        │     └── Puntúa BG, BAC, Banistmo — elige el de mayor score (mínimo 0.3)
        ├── parser.parse(file_path)
        │     └── Devuelve: {transactions: [...], account_signatures: [...], detected_last4: "XXXX"}
        ├── [ERROR si hay más de 1 account_signature — significa múltiples cuentas en un archivo]
        ├── AccountDetectionService.detect_or_create_account(...)
        │     └── Calcula fingerprint → busca en DB → crea si no existe
        ├── AnalysisService.build_analysis(transactions, user_id, user_name)
        │     ├── categorize_transactions() → por cada tx: FinancialClassifier.predict()
        │     └── Acumula: total_income, total_expenses, balance, categorías, recomendaciones
        ├── AnalysisService.save_snapshot()
        │     └── Persiste en analysis_snapshots (SIN la lista de transacciones en el JSON)
        ├── AnalysisService.save_transactions()
        │     └── Persiste cada transacción en analysis_transactions
        ├── Job → status="success"
        └── Elimina archivo temporal

PASO 3: Usuario consulta resultados
GET /api/v1/jobs/{job_id}                          ← ver si terminó y si fue success o error
GET /api/v1/analysis                               ← lista todos los análisis del usuario
GET /api/v1/analysis/{snapshot_id}                 ← KPIs del análisis
GET /api/v1/analysis/{snapshot_id}/transactions    ← transacciones individuales
  Filtros opcionales:
    ?requires_review=true   ← solo las que tienen confidence < 0.8
    ?max_confidence=0.5     ← solo las que tienen confidence ≤ 0.5
```

---

## detail_normalizer — Cómo limpia los descriptores

**Problema:** Los bancos ponen ruido en los descriptores. "SPOTIFY" puede aparecer como:
- `DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680` (Banco General, vía internet)
- `SPOTIFY-4187-94XX-XXXX-6798` (Banco General, cargo directo con tarjeta)

Si guardamos la versión sucia en el KB, nunca habrá match porque cada transacción tiene IDs distintos.

**Solución:** `canonicalize_detail(raw_detail) → str` limpia el descriptor en 4 pasos:

```
1. normalize_text          → Mayúsculas, quitar acentos, colapsar espacios
2. strip_variable_suffixes → Quitar: IDs numéricos largos, sufijos de tarjeta (-4187-94XX-XXXX-6798),
                              códigos de referencia alfanuméricos (7006M4Z73), etc.
3. detect_canonical_merchant → Si hay una regla para el merchant (SPOTIFY, NETFLIX, UBER...),
                               devolver directo el nombre canónico
4. remove_noise_tokens + truncar a 5 tokens → Quitar "DB", "CR", "POS", "COMPRA", "MCD CTE", etc.
```

**Ejemplos reales:**

| Descriptor raw (como llega del banco) | Clave canónica resultante |
|---|---|
| `DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680` | `SPOTIFY` |
| `SPOTIFY-4187-94XX-XXXX-6798` | `SPOTIFY` |
| `CRUNCHYROLL  PAB-4187-94XX-XXXX-6798` | `CRUNCHYROLL` |
| `AMAZON PRIME 7006M4Z73-4187-94XX-XXXX-6798` | `AMAZON PRIME` |
| `TRESCUATES-4187-94XX-XXXX-6798` | `TRESCUATES` |
| `SUBWAY VILLA LUCRE 201-4187-94XX-XXXX-6798` | `SUBWAY` |
| `DB POS COMPRA MCD CTE-XTRA MARKE` | `SUPERMERCADO XTRA` |
| `GOOGLE CRU-4187-94XX-XXXX-6798` | `CRUNCHYROLL` (Banistmo nombra Crunchyroll como "GOOGLE CRU") |
| `GOOGLE MOB` | `GOOGLE MOB` (suscripción Play Store — sufijo preservado, no colapsa a GOOGLE) |
| `GOOGLE YTU` | `GOOGLE YTU` (sufijo Play Store desconocido — ídem) |
| `GOOGLE ONE` | `GOOGLE ONE` (almacenamiento Google — regla explícita) |

**Regla general de Play Store (Banistmo):** Banistmo trunca el nombre del app como `GOOGLE XXX` (3 letras). La regla `\bGOOGLE\s+([A-Z]{2,6})\b` → `"GOOGLE " + suffix` preserva cada sufijo como clave distinta. Las reglas explícitas (`GOOGLE CRU`, `GOOGLE ONE`, `GOOGLE GRI`) tienen precedencia y se revisan primero.

**Cómo agregar una regla de merchant:**

```python
# En app/services/detail_normalizer.py

# Si el merchant puede confundirse con otro → va en SPECIFIC_MERCHANT_RULES (se revisan PRIMERO)
# Acepta string fijo o callable que recibe el re.Match:
(re.compile(r"\bMI_MERCHANT_ESPECIFICO\b", re.IGNORECASE), "NOMBRE CANÓNICO"),
(re.compile(r"\bPREFIJO\s+(\w+)\b", re.IGNORECASE), lambda m: "PREFIJO " + m.group(1).upper()),

# Si es un merchant único sin ambigüedad → va en GENERIC_MERCHANT_RULES
(re.compile(r"\bMI_MERCHANT\b", re.IGNORECASE), "NOMBRE CANÓNICO"),
```

---

## FinancialClassifier — Cómo categoriza transacciones

Cuando llega una transacción, el clasificador busca en este orden (se detiene en el primer match):

| Paso | Qué revisa | Si hace match | Confidence |
|---|---|---|---|
| 0 | ¿El nombre del usuario aparece en el detalle? | → `own_transfer` (transferencia propia) | 1.0 |
| 0b | ¿Dice "ACH" o "XPRESS" sin nombre del usuario? | → `third_party_transfer` (transferencia a tercero) | 0.85 |
| 1 | ¿La clave canónica existe en el KB personal? | → categoría del KB personal | 1.0 |
| 1b | ¿El raw descriptor existe en KB personal (legacy)? | → categoría del KB personal | 1.0 |
| 2 | ¿Algún patrón regex del KB personal coincide? | → categoría del patrón personal | 0.92 |
| 3 | ¿La clave canónica existe en el KB global? | → categoría del KB global | 1.0 |
| 3b | ¿El raw descriptor existe en KB global (legacy)? | → categoría del KB global | 1.0 |
| 4 | ¿Algún patrón regex del KB global coincide? | → categoría del patrón global | 0.90 |
| 5 | ¿Algún patrón builtin hardcodeado coincide? | → categoría hardcodeada | 0.90–0.95 |
| 6 | Ninguno de los anteriores | → fallback por tipo de movimiento | 0.3 |

**¿Qué significa confidence=0.3?** Que el clasificador no sabe qué es la transacción y usó el fallback (si es débito → gasto genérico desconocido, si es crédito → ingreso genérico). Estas transacciones tienen `requires_review=true`.

**Patrones builtin hardcodeados más importantes:**

| Patrón en el detalle | economic_type | economic_type_detail | budget_role |
|---|---|---|---|
| `ENTRE CUENTAS` | `transferencia_propia` | `transferencia_propia` | `solo_balance` |
| `PLANILLA`, `SALARIO`, `NOMINA`, `PAYROLL` | `ingreso` | `salario` | `presupuestable` |
| `^YAPPY BG DE ` (recibir dinero) | `ingreso` | `otros_ingresos` | `presupuestable` |
| `^YAPPY BG A `, `^PAGO YAPPY BG A ` (enviar) | `transferencia_tercero` | `transferencia_tercero` | `revisar` |
| `COMISION`, `CARGO ANUAL` | `cargo_financiero` | `comision` | `gasto_financiero` |
| `ITBMS` | `cargo_financiero` | `impuesto` | `gasto_financiero` |
| `CR DEVOLUCION`, `REVERSO` | `reembolso` | `reembolso` | `solo_balance` |
| `CREDITO TRANSF. DE CC/AH A CC/AH` | `transferencia_propia` | `transferencia_propia` | `solo_balance` |
| `PAGO DE TARJETA DE CREDITO`, `PAGO DEBITADO PARA TDC`, `PAGO XXXX-XX**-****-XXXX` | `cargo_financiero` | `cargo_bancario` | `gasto_financiero` |
| `COMPASS` | `cargo_financiero` | `cargo_bancario` | `gasto_financiero` |

**Cómo agregar un patrón builtin:**

```python
# En app/services/financial_classifier.py, en BUILTIN_PATTERNS:
(
    r"MI_REGEX_PATRON",          # expresión regular que buscar en el detalle
    {
        "Economic Type": "gasto",              # uno de los 6 valores generales
        "Economic Type Detail": "gasto_variable",  # valor granular
        "SubType Economic": "recurrente",
        "Categoría de presupuesto": "servicios",
        "budget_role": "presupuestable",       # ver tabla de budget_role abajo
    },
    0.90,                        # confidence (usar 0.90 como estándar)
    "builtin:nombre_descriptivo",
),
```

---

## Taxonomía de categorías — Estructura actual

El sistema usa **5 campos** para clasificar cada transacción. `"Tipo de transacción"` fue eliminado completamente.

### economic_type — 6 valores generales
| Valor | Cuándo usarlo |
|---|---|
| `ingreso` | Cualquier entrada de dinero (salario, otros ingresos) |
| `gasto` | Cualquier salida de dinero (variable, recurrente) |
| `cargo_financiero` | Comisiones bancarias, impuestos (ITBMS), cargos automáticos |
| `transferencia_propia` | Movimiento entre cuentas del mismo usuario |
| `transferencia_tercero` | Envío de dinero a otra persona (Yappy, ACH a tercero) |
| `reembolso` | Devolución o reverso de un cargo previo |

### economic_type_detail — valores granulares
| Valor | Cuándo usarlo |
|---|---|
| `salario` | Nómina, planilla, PAYROLL |
| `otros_ingresos` | Ingresos no clasificados como salario |
| `gasto_variable` | Gasto no recurrente (fallback para gastos desconocidos) |
| `gasto_recurrente` | Suscripciones, servicios fijos |
| `comision` | Comisión bancaria, cargo anual |
| `impuesto` | ITBMS |
| `cargo_bancario` | Protección tarjeta, membresía, valor de tarjeta |
| `transferencia_propia` | Espeja `economic_type` para transferencias propias |
| `transferencia_tercero` | Espeja `economic_type` para transferencias a terceros |
| `reembolso` | Espeja `economic_type` para reembolsos |

### SubType Economic — auto-detección por frecuencia
El campo `subtype_economic` se asigna en **dos pasadas**:

1. **Primera pasada** (clasificador): el valor viene del KB o del patrón builtin.
2. **Segunda pasada** (`_apply_subtype_auto_detection` en `build_analysis`): se reemplaza según la frecuencia del merchant en el archivo subido:
   - `economic_type == "cargo_financiero"` → siempre `"financiero"` (sin importar frecuencia)
   - `economic_type in {"transferencia_propia", "transferencia_tercero"}` → se mantiene el valor del clasificador
   - método builtin + subtype no-soft → se mantiene (ej: salario con `builtin:salario` → `"recurrente"`)
   - todo lo demás: 3+ ocurrencias del mismo merchant → `"recurrente"`, 1–2 → `"extraordinario"`

Valores posibles: `recurrente`, `extraordinario`, `variable`, `operativo`, `fijo`, `interno`, `financiero`, `desconocido`.

---

## budget_role — Los 7 valores canónicos

Define el rol de la transacción en el presupuesto. **Solo `solo_balance` se excluye de los totales (income/expenses).** Los demás 6 sí cuentan.

| Valor | Cuándo usarlo | ¿Cuenta en KPIs? |
|---|---|---|
| `presupuestable` | Ingreso o gasto planeado y regular (ej: salario, supermercado, servicios del hogar) | ✅ Sí |
| `no_presupuestable` | Gasto real pero fuera del presupuesto (ej: cena de ocasión, compra extraordinaria) | ✅ Sí |
| `gasto_operativo` | Gasto operativo recurrente del día a día (ej: transporte, gasolina) | ✅ Sí |
| `gasto_financiero` | Cargos del banco, comisiones, impuestos (ITBMS) | ✅ Sí |
| `ahorro_inversion` | Depósito a ahorro o inversión | ✅ Sí |
| `solo_balance` | Transferencia entre cuentas propias del mismo usuario (no es ingreso ni gasto real) | ❌ No — se excluye de totales |
| `revisar` | No se sabe bien qué es, baja confianza, el usuario debe revisar | ✅ Sí |

---

## Endpoint /learn — Cómo el sistema aprende

`POST /api/v1/transactions/learn`

Cuando el usuario ve una transacción mal categorizada, la corrige con este endpoint. El clasificador guarda el ejemplo en el KB y la próxima vez que vea un descriptor similar, lo categorizará correctamente.

**Request:**
```json
{
  "detail": "TRESCUATES-4187-94XX-XXXX-6798",  ← descriptor raw completo (el sistema lo limpia internamente)
  "economic_type": "gasto",
  "subtype_economic": "extraordinario",
  "transaction_type": "gasto",
  "budget_category": "restaurantes",
  "budget_role": "no_presupuestable",
  "weight": 2,            ← 2 = corrección explícita del usuario (valor recomendado)
  "force_personal": false ← false = el sistema decide si va a KB global o personal
                            true = forzar KB personal aunque sea un merchant global
}
```

**Response:**
```json
{
  "message": "KB personal actualizado correctamente.",
  "detail_learned": "TRESCUATES",   ← IMPORTANTE: esta es la clave canónica que quedó guardada,
                                       NO el descriptor raw. Confirma que el normalizer funcionó.
  "kb_target": "personal",          ← dónde se guardó: "personal" o "global"
  "personal_exact_matches": 2,      ← cuántas entradas exactas tiene ahora el KB personal
  "personal_patterns": 2            ← cuántos patrones regex tiene ahora el KB personal
}
```

**¿KB personal o global?**
- Si el descriptor contiene keywords globales (UBER, NETFLIX, SPOTIFY, etc.) y `force_personal=false` → va al KB **global** (beneficia a todos los usuarios)
- Si es un merchant local (restaurante panameño, negocio local) → va al KB **personal** (solo te aplica a ti)

---

## Auth — Endpoints de autenticación

| Endpoint | Método | Body | Notas |
|---|---|---|---|
| `/auth/register` | POST | JSON: email, password, full_name | Crea cuenta nueva |
| `/auth/login` | POST | Form: username, password | `application/x-www-form-urlencoded`. Devuelve JWT |
| `/auth/forgot-password` | POST | JSON: email | En DEBUG=true devuelve el token en el response. En producción manda email |
| `/auth/reset-password` | POST | JSON: token, new_password | Token tiene TTL de 15 minutos |
| `/auth/change-password` | POST | JSON: current_password, new_password | Requiere Bearer token |
| `/users/me` | GET | — | Requiere Bearer token. Devuelve datos del usuario |

---

## Decisiones de diseño — Por qué las cosas son como son

- **Parser detection por estructura, nunca por nombre de archivo.** El usuario puede subir "estado_cuenta.xlsx" o "archivo_random.xlsx" — el nombre no importa.

- **Nunca pasar `UploadFile.file` directamente a los parsers.** FastAPI's UploadFile es un stream en memoria. Siempre guardar a path temporal primero o pandas no puede leerlo.

- **Las transacciones se persisten en `analysis_transactions`, NO en el JSON del snapshot.** `analysis_snapshots.summary` guarda solo los KPIs agregados (totales, categorías). Las transacciones individuales van a su propia tabla. Razón histórica: guardarlo en el JSON causaba un `TypeError: Object of type datetime is not JSON serializable`.

- **El KB guarda claves canónicas, no descriptores raw.** "TRESCUATES" en el KB matchea cualquier versión sucia del descriptor (con tarjeta, con ID de referencia, con cualquier ruido).

- **`requires_review` no existe en la base de datos.** Es un campo calculado en el endpoint: si `confidence < 0.8` → `requires_review=true`. El schema tiene `bool = False` como default — no eliminarlo o la serialización falla.

- **Fingerprint de cuenta** = `hash(user_id + bank_name + account_type + nickname + last4)`. Permite detectar si ya existe la cuenta sin buscar por nombre.

- **Deduplicación por SHA-256 sobre bytes del archivo, no por nombre.** Los exports de BAC siempre se llaman igual (e.g., "Estado de cuenta.xls"). Usar el nombre sería inútil. El hash se computa sincrónicamente en el endpoint (antes de encolar), así el usuario recibe feedback instantáneo (HTTP 409) en lugar de esperar que el worker falle. El hash se registra en `uploaded_files` solo DESPUÉS de un pipeline exitoso — si el job falla, el usuario puede reintentar con el mismo archivo sin recibir un falso 409. La `UniqueConstraint("user_id", "checksum")` en `uploaded_files` actúa como red de seguridad para race conditions.

- **Un solo archivo = una sola cuenta.** Si el Excel tiene transacciones de dos cuentas distintas, el pipeline lo rechaza con HTTP 422. Cada archivo debe ser de una sola cuenta.

- **Nunca usar descriptores de transacciones para identificar el banco.** "MCD CTE", "DB POS COMPRA", "BANCO GENERAL" aparecen dentro de los descriptores de transacciones de Banistmo. Si se usaran como señal → Banistmo sería mal identificado.

- **Compatibilidad Python 3.10/3.14.** El proyecto corre en Python 3.14 en Windows pero el VM Linux de Cowork usa Python 3.10. `datetime.UTC` solo existe desde 3.11. El código usa `from datetime import timezone as _tz; UTC = _tz.utc`.

- **`BacParser` y `BanistmoParser` extraen `account_number` de `row.iloc[1]` únicamente.** Extraerlo del texto completo de la fila concatena dígitos de saldos adyacentes y produce números falsos.

- **`solo_balance` se excluye de `categories` además de los totales.** Un diseño anterior acumulaba `categories[budget_cat]` para todas las transacciones, causando que una transferencia a ahorros de $835 apareciera en el dict `categories` aunque estuviera excluida de `total_income` y `total_expenses`. Ahora `categories` solo acumula las transacciones que cuentan en los totales. Las transacciones `solo_balance` sí quedan registradas en `budget_roles` para trazabilidad.

- **Los nombres de categoría se normalizan quitando acentos antes de acumular.** Los KBs pueden devolver `"alimentación"` (con tilde) mientras otros paths devuelven `"alimentacion"` (sin tilde), creando dos claves distintas en el dict de categorías. El fix aplica `unicodedata.normalize("NFD", cat).encode("ascii", "ignore").decode("ascii")` al nombre de categoría antes de usarlo como key. Resultado: siempre `"alimentacion"`, nunca `"alimentación"`.

- **`analysis_snapshots.bank_account_id` es nullable con ON DELETE SET NULL.** Si el usuario elimina la cuenta bancaria, los snapshots históricos se conservan con `bank_account_id=NULL` en lugar de borrarse. Los snapshots creados antes de la migración también tendrán `bank_account_id=NULL`. Los endpoints de análisis retornan `bank_account: null` en esos casos — el frontend debe manejarlo.

- **`GET /analysis` usa batch-query para evitar N+1.** Hace un único `SELECT * FROM bank_accounts WHERE account_id IN (...)` para todos los snapshots de la página en lugar de un query por snapshot.

- **Los fixtures XLSX de tests deben tener al menos una fila con col6 != None.** Si todas las filas de la columna de crédito (col6) son `None`, openpyxl no persiste esa columna en el archivo → pandas lee solo 6 columnas → `_extraer_format1` descarta todas las filas con `if len(row) < 7`. Esto aplica a cualquier fixture BG que solo tenga débitos. Solución: incluir siempre una fila con crédito, o usar una fila dummy con col6=0.01.

---

## Estado actual — Qué funciona y qué no

### ✅ Funciona completamente

- **Pipeline E2E**: Upload XLSX → Celery → Parse → Categorize → Save → job="success" (validado con archivos reales de BG, BAC y Banistmo)
- **Parsers**: BG (Format 1), BAC (.xls), Banistmo (.xlsx) — los tres con score=1.0 en sus archivos y 0.0 en los demás. Validados E2E contra DB real.
- **KB y /learn**: Usado en producción con los 3 bancos. Reglas de normalización extendidas: PAGO TDC (número enmascarado), COMPASS (comisión BAC dispositivo), PEDIDOSYA/PEDIDOS YA, GOOGLE Play Store (sufijos preservados)
- **Persistencia**: `analysis_transactions` se llena correctamente con nueva columna `economic_type_detail`
- **Normalizer**: stripea sufijo de tarjeta BG/BAC (`-4187-94XX-XXXX-6798`), IDs alfanuméricos, ruido bancario
- **Clasificador**: KB global + personal con claves canónicas. `learn()` retorna la clave canónica guardada
- **/learn**: Funciona. `detail_learned` en el response muestra la clave canónica real (no el raw input)
- **/reclassify**: Funciona. Actualiza DB + enseña al KB. `confidence=1.0`, `method="user_reclassified"`
- **Deduplicación de archivos**: SHA-256 sobre el contenido del archivo. Retorna HTTP 409 si el usuario sube el mismo archivo dos veces (independiente del nombre). El hash se registra en `uploaded_files` al finalizar el pipeline exitosamente.
- **Taxonomía**: 2 columnas de tipo económico (`economic_type` general + `economic_type_detail` granular). `"Tipo de transacción"` eliminado. SubType auto-detectado por frecuencia de merchant en el archivo.
- **budget_role**: 7 valores canónicos alineados entre schema, normalizer y KB
- **Auth**: registro, login, forgot/reset/change password (email vía Resend en prod, token en response en DEBUG)
- **Tests**: 183 passed, 3 warnings en verde (`tests/unit/`, `tests/services/`, `tests/api/`, `tests/integration/`)
- **`bank_account_id` en snapshots**: cada análisis ahora sabe de qué banco proviene. `GET /analysis` y `GET /analysis/{id}` retornan `bank_account: {account_id, bank_name, account_last4, nickname}` (batch-query, sin N+1)
- **Celery + Redis**: validado E2E (7/7 tests)

### ⚠️ Implementado pero sin prueba E2E completa

- **Email de reset**: solo probado en DEBUG=true (retorna token). La integración real con Resend no ha sido probada.

### 🔲 Pendiente / No implementado

- **`app/workers/job_runner.py`**: archivo vacío (0 bytes). Pendiente de `git rm` desde Windows.
- **Frontend**: en desarrollo activo (sesión 14) — ver sección Frontend más abajo.
- **`transaction_repository.py`**: stub vacío. Necesario si se quiere re-categorización masiva o queries filtradas avanzadas.

---

## Tests

| Archivo | Cobertura | Tests |
|---|---|---|
| `tests/unit/test_financial_classifier.py` | predict (exact/pattern/builtin/fallback), learn, canonical keys, ambiguity, reload, Python 3.10 compat | 38 |
| `tests/unit/test_parsers.py` | BG, BAC, Banistmo — scores, transacciones, account signatures | 5 |
| `tests/services/test_financial_classifier.py` | predict, learn, canonical keys, builtin, ambiguity, reload (taxonomía nueva: Economic Type Detail) | 12 |
| `tests/services/test_analysis_service.py` | build_analysis, save_snapshot (sin transactions en summary), save_transactions, solo_balance excluido de categories, normalización de acentos | 7 |
| `tests/services/test_detail_normalizer.py` | canonicalize_detail, normalize_categories (nueva taxonomía, sin Tipo de transacción), is_ambiguous_key, GOOGLE Play Store sufijos | 32 |
| `tests/api/test_analysis_transactions_endpoint.py` | list, filter requires_review, filter max_confidence, 404s | 5 |
| `tests/api/test_reclassify_endpoint.py` | happy path, also_learn=False, 404 not found, 404 wrong user, budget_role solo_balance | 5 |
| `tests/api/test_bulk_reclassify_endpoint.py` | happy path (todas actualizadas), skip_user_reclassified=True, skip=False (fuerza manuales), 404 not found, 404 wrong user | 5 |
| `tests/api/test_kb_endpoint.py` | list entries sorted, list categories, list empty, preview canonical, preview ambiguous, delete entry, delete 404 | 7 |
| `tests/api/test_confidence_stats_endpoint.py` | confidence-stats: counts, empty snapshot, all-high, 404s | 5 |
| `tests/api/test_features_endpoint.py` | features: happy path, by_week, by_dow (7 entries), velocity, category_ratios sum 100%, merchant_concentration, 404s | 13 |
| `tests/services/test_recommendation_engine.py` | 10 reglas: no_income, expenses_exceed, savings_rate, top_category, concentration, bank_charges, unknown_spend, low_confidence, recurring, price_increase, all_clear, output structure | 31 |
| `tests/api/test_snapshot_bank_account_endpoint.py` | bank_account en GET /analysis (con y sin cuenta), GET /analysis/{id}, 404 wrong user, BankAccountSummary schema | 7 |
| `tests/integration/test_files_upload_api.py` | upload → job creado → pipeline ejecutado síncronamente con mock. Usa XLSX real generado con `_make_bg_xlsx()`. Incluye test de 409 por duplicate_file. | 8 |
| `tests/e2e/test_celery_e2e.py` | Flujo completo contra infra real: HTTP → Celery → Redis → Worker → PostgreSQL. Requiere servidor + worker corriendo. | 7 |
| **TOTAL** | | **183 passed, 3 warnings (e2e requieren infra real)** |

**Nota sobre fixtures XLSX:** Los tests de integración y e2e usan `_make_bg_xlsx(*rows)` (definida en cada archivo de test) para generar XLSX en formato Banco General. Regla crítica: si todas las filas de col6 (crédito) son `None`, openpyxl no persiste esa columna → pandas lee solo 6 columnas → `_extraer_format1` descarta todas las filas con `len(row) < 7`. Siempre incluir al menos una fila con col6 != None en fixtures BG.

---

## Migraciones aplicadas

| Revisión | Descripción |
|---|---|
| `aee0d9a03b5b` | Tablas base: users, bank_accounts, uploaded_files |
| `74c3709235b6` | processing_jobs, analysis_snapshots |
| `b91e024a922a` | original_filename y file_type (nullable) en processing_jobs |
| `c4f9e2a1d8ab` | analysis_transactions |
| `d7e3f1a2b9c4` | Agrega `economic_type_detail`, elimina `transaction_category` de analysis_transactions |
| `e5b3f8a2c1d9` | Agrega `bank_account_id` (FK nullable → bank_accounts, ON DELETE SET NULL) a analysis_snapshots |

---

## Frontend

**Stack:** React + Vite + TypeScript + shadcn/ui + Tailwind CSS. Meta a largo plazo: portar a React Native + Expo reutilizando la lógica de hooks y API client.

**Arrancar el frontend:**
```bash
cd frontend
npm install
npm run dev     # http://localhost:3000 (proxy → backend en :8001)
npm run build   # build de producción
```

**Estructura:**
```
frontend/src/
├── api/        ← cliente axios + funciones tipadas por dominio
│   ├── client.ts     ← instancia axios, interceptors JWT + 401
│   ├── auth.ts       ← login, register, forgot/reset password
│   ├── files.ts      ← uploadFile (multipart)
│   ├── jobs.ts       ← getJob, listJobs
│   ├── analysis.ts   ← listAnalysis, getAnalysis, getTransactions, reclassify
│   └── users.ts      ← getMe
├── stores/
│   └── authStore.ts  ← Zustand + persist: token, user, isAuthenticated
├── types/index.ts    ← interfaces TypeScript (User, ProcessingJob, AnalysisSnapshot, etc.)
├── components/
│   ├── AppShell.tsx  ← sidebar + header móvil + Outlet
│   └── ui/           ← shadcn/ui: button, card, badge, input, label, toast
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ForgotPasswordPage.tsx   ← muestra debug token si DEBUG=true
│   ├── ResetPasswordPage.tsx    ← lee ?token= de la URL
│   ├── DashboardPage.tsx        ← KPIs del análisis más reciente + gráfica categorías
│   ├── UploadPage.tsx           ← drag&drop, polling de job, redirect a /analysis
│   ├── AnalysisListPage.tsx     ← historial de snapshots con info del banco
│   ├── AnalysisDetailPage.tsx   ← KPIs, pie chart, recomendaciones
│   └── TransactionsPage.tsx     ← listado + filtro requires_review + reclasificación inline
└── lib/utils.ts    ← cn, formatCurrency, formatDate, formatPeriod (null-safe), etc.
```

**Notas de diseño importantes:**

- **`job.job_id`** (no `job.id`) — el backend usa `job_id` como primary key. El frontend `ProcessingJob.job_id` refleja esto.
- **`ProcessingJob` no tiene `snapshot_id`** — el backend no vincula el job con el snapshot. Al completar el upload, el frontend redirige a `/analysis` (lista) en lugar de al snapshot específico.
- **`user.user_id`** (no `user.id`) — el backend usa `user_id` como UUID primario.
- **`formatPeriod(start | null, end | null)`** — null-safe; retorna "Período sin fecha" si ambos son null.
- **Toast global** — `src/components/ui/toast.tsx` implementa un store singleton sin proveedor. Usar `toast("mensaje", "success"|"error"|"info")` desde cualquier componente. `<Toaster />` montado en `main.tsx`.
- **ForgotPassword DEBUG mode** — cuando `DEBUG=true` el backend retorna el token en el response. La página lo muestra con un link directo a `/reset-password?token=...` para facilitar el desarrollo.

**Features completadas:**
- Auth completo: login, register, forgot-password, reset-password
- Dashboard: KPIs del análisis más reciente + gráfica de barras de categorías + recomendaciones
- Upload: drag&drop, progreso por fases (en cola → procesando → completado), manejo de 409 duplicado
- Lista de análisis: historial con banco y últimos 4 dígitos visibles
- Detalle de análisis: KPIs, pie chart de categorías, recomendaciones con badges
- Transacciones: filtro por requires_review, búsqueda local, reclasificación inline con también-aprender

**Pendiente del frontend:**
- Agregar campo `economic_type_detail` al formulario de reclasificación
- Página de cuentas bancarias (CRUD de `/accounts`)
- Página de KB (gestión del knowledge base)
- Estadísticas de confianza visibles en detalle de análisis

---

## Roadmap

### Prioridad Alta

- **Frontend (en curso)**: continuar completando las páginas faltantes (cuentas, KB).
- **Seguir entrenando el KB**: subir archivos periódicamente, revisar con `?requires_review=true`, usar `/learn` y `/reclassify` para bajar la tasa de fallback.
- **Medir tasa de confianza**: usar `/confidence-stats` antes y después de cada sesión de entrenamiento.

### Prioridad Media

- **Resend en producción**: configurar dominio verificado y RESEND_API_KEY real.
- **`transaction_repository.py`**: implementar si se necesita re-categorización masiva o queries filtradas avanzadas.
- **Eliminar `job_runner.py`**: confirmado vacío (0 bytes). Hacer `git rm backend/app/workers/job_runner.py` desde Windows.

### Prioridad Baja / Deuda Técnica

- **~~Migrar `python-jose` → `PyJWT`~~**: ✅ completado. PyJWT 2.12.1 en uso.
- **~~Verificar passlib~~**: ✅ confirmado. Solo pwdlib en `security.py`. passlib no está en uso.
- **~~Eliminar stubs~~**: ✅ `transaction.py`, `category_override.py`, `dto.py`, `enums.py`, `auth_service.py`, `financial_classifier_backup.py` — eliminados con `git rm`.
- **~~Migrar `@app.on_event("startup")` a `lifespan`~~**: ✅ completado.
- **~~Migrar `AnalysisTransactionResponse` a `ConfigDict`~~**: ✅ completado.
- **~~Rate limiting~~**: ✅ implementado con `slowapi`. Activo automáticamente cuando `DEBUG=false`.
- **~~Recomendaciones financieras~~**: ✅ 10 reglas en producción (cross-snapshot incluido).
