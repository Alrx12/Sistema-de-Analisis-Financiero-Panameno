# 🏦 Sistema de Análisis Financiero Multi-Cuenta - Panamá v3.0

## 📋 Tabla de Contenidos
1. [Novedades v3.0](#novedades-v30)
2. [Contexto del Proyecto](#contexto-del-proyecto)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Instalación](#instalación)
5. [Guía de Uso](#guía-de-uso)
6. [Modelo de Datos](#modelo-de-datos)
7. [Flujo de Procesamiento](#flujo-de-procesamiento)
8. [Recomendaciones](#recomendaciones)

---

## 🆕 Novedades v3.0

### ✅ Sistema Multi-Cuenta
**Antes**: Solo podías tener una cuenta por banco  
**Ahora**: Múltiples cuentas del mismo banco (ej: 2 cuentas de Banco General + 1 BAC + 1 Banistmo)
Ejemplo de configuración:
├── Banco General - Cuenta de Ahorros (****1234)
├── Banco General - Cuenta Corriente (****5678)
├── BAC Credomatic - Tarjeta de Crédito (****9012)
└── Banistmo - Cuenta de Ahorros (****3456)


### ✅ Gestión Inteligente de Archivos
- **Sesiones limpias**: Cada análisis es independiente, sin acumulación de datos viejos
- **Reutilización**: Opción de usar archivos previamente procesados desde históricos
- **Organización automática**: Archivos movidos a `procesados/YYYYMMDD_HHMMSS/` tras el análisis
- **Detección de cuentas**: El sistema intenta detectar automáticamente el tipo de cuenta y últimos 4 dígitos

### ✅ Interfaz Interactiva Mejorada
- Menú principal con login de usuarios
- Configuración de cuentas "on-the-fly" al procesar archivos
- Selección visual de archivos a procesar

---

## 🎯 Contexto del Proyecto

### ¿Qué problema resuelve?
En Panamá, los 3 bancos principales generan extractos en formatos completamente diferentes:

| Banco | Formato Fecha | Estructura | Identificadores |
|-------|--------------|------------|-----------------|
| **Banco General** | `2026-03-15 12:54:04` | Débito/Crédito separados | "YAPPY BG", "ACH XPRESS" |
| **Banistmo** | `17 mar. 2026` | Retiro/Depósito | "DB POS COMPRA", "DB ACH" |
| **BAC Credomatic** | `13/09/2025` | Débitos/Créditos | Códigos: CP, PT, 4E, CM |

**El problema real**: Un usuario puede tener múltiples cuentas en el mismo banco (ahorros, corriente, tarjetas), y consolidar todo como "Banco General" pierde la granularidad necesaria para un análisis financiero preciso.

### Solución v3.0
- **Modelo Usuario → Cuentas → Transacciones** (no solo Usuario → Banco)
- Cada transacción se asigna a una cuenta específica con ID único
- Análisis por cuenta individual y consolidado

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Entidades
┌─────────────────────────────────────┐
│           USUARIO                   │
│  (alexis_pineda)                    │
│  ├── nombre: "Alexis Pineda"        │
│  ├── carpeta_datos: "./datos/..."   │
│  └── carpeta_procesados: "./..."    │
└─────────────┬───────────────────────┘
│
▼
┌─────────────────────────────────────┐
│         CUENTAS (1..N)              │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ cuenta_id: "alexis_bg_ah_1234" │
│  │ nombre: "Ahorros BG"        │   │
│  │ banco: "Banco General"      │   │
│  │ tipo: "ahorros"             │   │
│  │ numero: "1234"              │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ cuenta_id: "alexis_bg_cc_5678" │
│  │ nombre: "Corriente BG"      │   │
│  │ banco: "Banco General"      │   │
│  │ tipo: "corriente"           │   │
│  │ numero: "5678"              │   │
│  └─────────────────────────────┘   │
└─────────────┬───────────────────────┘
│
▼
┌─────────────────────────────────────┐
│       TRANSACCIONES (por cuenta)    │
│  ├── fecha, descripcion, monto      │
│  ├── cuenta_id (referencia)         │
│  ├── cuenta_nombre (denormalizado)  │
│  └── categoria, tipo, metodo_pago   │
└─────────────────────────────────────┘


### Estructura de Carpetas
proyecto/
├── Sistema_Analisis_Financiero.py    # Código principal
├── usuarios_config.json              # Configuración de usuarios y cuentas
└── datos_bancarios/
└── alexis_pineda/                # Carpeta por usuario
├── [archivos nuevos aquí]    # Excel/CSV pendientes
└── procesados/               # Histórico
└── 20260317_143022/      # Timestamp de procesamiento
├── archivo1.xlsx     # Archivos ya procesados
└── archivo2.xls


### Patrones de Diseño Utilizados

| Patrón | Uso | Beneficio |
|--------|-----|-----------|
| **Strategy** | Parsers específicos por banco | Fácil agregar nuevos bancos |
| **Factory** | `detectar_banco_y_cuenta()` | Creación dinámica de parsers |
| **Repository** | `UserManager` con JSON | Persistencia simple sin BD |
| **DTO** | `Transaccion`, `CuentaBancaria` | Estandarización de datos |
| **Template Method** | `BankParser.procesar()` | Flujo consistente con personalización |

---

## 💻 Instalación

### Requisitos
```bash
Python 3.8+
pip install pandas numpy openpyxl xlrd

Instalación de Dependencias

# Windows
pip install pandas numpy openpyxl xlrd

# O si prefieres un requirements.txt
pip install -r requirements.txt

Primer Inicio
python Sistema_Analisis_Financiero.py

🚀 Guía de Uso
Flujo de Trabajo Completo
1. Crear Usuario (Primera vez)
🏦 SISTEMA DE ANÁLISIS FINANCIERO MULTI-CUENTA v3.0
============================================================
1. Iniciar sesión
2. Crear nuevo usuario  <-- Selecciona esta
3. Listar usuarios
4. Salir

> 2

👤 CREAR NUEVO USUARIO
============================================================
ID de usuario (ej: alexis_pineda): alexis_pineda
Tu nombre completo: Alexis Pineda

✓ Usuario 'Alexis Pineda' creado.
  Las cuentas bancarias se configurarán al procesar archivos.

2. Iniciar Sesión y Procesar Archivos

> 1 (Iniciar sesión)

👤 Alexis Pineda | 0 cuentas configuradas
============================================================
1. Procesar archivos bancarios  <-- Selecciona esta
2. Ver análisis actual
3. Exportar reporte
4. Gestionar cuentas
5. Cerrar sesión

> 1

📂 PROCESAR ARCHIVOS BANCARIOS
============================================================
¿Qué deseas hacer?
1. Usar últimos archivos procesados
2. Agregar nuevos archivos  <-- Selecciona esta
3. Volver al menú anterior

> 2

a) Desde mi carpeta de datos
b) Desde rutas específicas

> a

📁 3 archivos encontrados:
  1. ULTIMOS-MOVIMIENTOS-CUENTA-DE-AHORROS-2026-03-17.xlsx
  2. 17_3_2026_MovimientosDeposito.xlsx
  3. Transacciones del mes.xls

Ingresa números a procesar (ej: 1,3) o 'todos': todos

3. Configurar Cuentas (Automático + Manual)
Durante el procesamiento, el sistema detectará el banco y preguntará:

✓ Banco detectado: Banco General
  ℹ Información detectada: Cuenta de ahorros, Nº: 1234

📋 Cuentas de Banco General disponibles:
  1. Crear nueva cuenta

Nombre de la cuenta [Ahorros Banco General]: Ahorros BG Principal
Tipo (ahorros/corriente/tarjeta) [ahorros]: ahorros
Últimos 4 dígitos [1234]: 1234

✓ Cuenta 'Ahorros BG Principal' creada y asociada

Si procesas otro archivo del mismo banco:
📋 Cuentas de Banco General disponibles:
  1. Ahorros BG Principal (ahorros) 1234
  2. Crear nueva cuenta  <-- Si es otra cuenta distinta

Selecciona cuenta (número): 2
…

4. Ver Análisis

👤 Alexis Pineda | 3 cuentas configuradas
============================================================
1. Procesar archivos bancarios
2. Ver análisis actual  <-- Selecciona esta
...

📊 RESULTADOS
============================================================

📈 RESUMEN:
  usuario: Alexis Pineda
  periodo: 01/09/2025 - 17/03/2026
  ingresos_totales: 13,243.78
  egresos_totales: 13,060.99
  balance_neto: 182.79
  total_cuentas: 3

🏦 RESUMEN POR CUENTA:
  • Ahorros BG Principal: $2,942.52 (339 trans)
  • Corriente BG: $1,118.47 (72 trans)
  • Tarjeta BAC: $4,200.00 (45 trans)

📊 TOP CATEGORÍAS:
  • Transferencias: $4,229.70 (32.4%)
  • Alimentación: $1,269.05 (9.7%)
  • Servicios Públicos: $1,177.33 (9.0%)

💳 SUSCRIPCIONES:
  • Spotify: $11.0/mes - Ahorros BG Principal
  • Disney+: $7.32/mes - Ahorros BG Principal


5. Exportar Reporte
> 3 (Exportar reporte)

✓ Reporte exportado: datos_bancarios/alexis_pineda/reporte_20260317_143022.json

📊 Modelo de Datos
Clase CuentaBancaria
@dataclass
class CuentaBancaria:
    cuenta_id: str      # "alexis_pineda_banco_general_ahorros_1234"
    nombre_cuenta: str  # "Ahorros BG Principal"
    banco: str          # "Banco General"
    tipo_cuenta: str    # "ahorros" | "corriente" | "tarjeta"
    numero_cuenta: str  # "1234" (últimos 4 dígitos)

Clase Transaccion (Actualizada)
@dataclass
class Transaccion:
    fecha: datetime
    descripcion: str
    monto: float
    tipo: TipoTransaccion
    categoria: CategoriaGasto
    banco_origen: str       # "Banco General"
    cuenta_id: str          # "alexis_pineda_banco_general_ahorros_1234"
    cuenta_nombre: str      # "Ahorros BG Principal"
    metodo_pago: str
    archivo_origen: str

Reporte JSON Generado
{
  "usuario": {
    "user_id": "alexis_pineda",
    "nombre": "Alexis Pineda",
    "cuentas": [
      {
        "cuenta_id": "alexis_pineda_banco_general_ahorros_1234",
        "nombre_cuenta": "Ahorros BG Principal",
        "banco": "Banco General",
        "tipo_cuenta": "ahorros",
        "numero_cuenta": "1234"
      }
    ]
  },
  "resumen": {
    "total_transacciones": 750,
    "total_cuentas": 3,
    "bancos_utilizados": ["Banco General", "BAC Credomatic", "Banistmo"],
    "cuentas_utilizadas": ["Ahorros BG Principal", "Corriente BG", "Tarjeta BAC"],
    "ingresos_totales": 13243.78,
    "egresos_totales": 13060.99,
    "balance_neto": 182.79
  },
  "analisis_por_cuenta": {
    "('Banco General', 'Ahorros BG Principal')": {
      "Total Gastado": 2942.52,
      "Transacciones": 339,
      "% del Total": 22.5
    }
  },
  "analisis_categorias": { ... },
  "suscripciones": [
    {
      "descripcion": "Spotify",
      "monto_mensual": 11.0,
      "banco": "Banco General",
      "cuenta": "Ahorros BG Principal"
    }
  ],
  "recomendaciones": [ ... ]
}

🔄 Flujo de Procesamiento

┌─────────────────┐
│  INICIO         │
│  (Menú Principal)│
└────────┬────────┘
         ▼
┌─────────────────┐
│  ¿Usuario       │
│  existe?        │
└────────┬────────┘
    No   │   Sí
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌─────────────┐
│ Crear  │ │ Iniciar     │
│Usuario │ │ Sesión      │
└───┬────┘ └──────┬──────┘
    └─────────────┘
              ▼
    ┌─────────────────────┐
    │  PROCESAR ARCHIVOS  │
    │  1. Limpiar sesión  │
    │  2. Elegir fuente   │
    │     (nuevos/hist)   │
    │  3. Para cada archivo│
    │     - Detectar banco│
    │     - Detectar/     │
    │       seleccionar   │
    │       cuenta        │
    │     - Procesar      │
    │     - Mover a       │
    │       procesados    │
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │  GENERAR ANÁLISIS   │
    │  - Por cuenta       │
    │  - Por categoría    │
    │  - Suscripciones    │
    │  - Recomendaciones  │
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │  EXPORTAR REPORTE   │
    │  (JSON con timestamp)│
    └─────────────────────┘

💡 Recomendaciones
Para Usuarios Finales

Gestión de múltiples cuentas:
Usa nombres descriptivos: "Ahorros BG Principal" vs "Ahorros BG Secundaria"
Verifica que el número de cuenta detectado sea correcto
Si tienes tarjeta de crédito y débito del mismo banco, créalas como cuentas separadas

Flujo de trabajo mensual:
Descarga extractos de todas tus cuentas
Copia archivos a tu carpeta datos_bancarios/[usuario]/
Procesa seleccionando "Agregar nuevos archivos"
Revisa el análisis por cuenta para identificar gastos
Exporta el reporte con timestamp para historial
Los archivos se mueven automáticamente a procesados/

Seguridad:
Los archivos Excel contienen datos sensibles
La carpeta procesados/ mantiene historial local
Nunca subas usuarios_config.json a repositorios públicos (contiene rutas locales)

Para Desarrolladores
Agregar un nuevo banco:

class NuevoBancoParser(BankParser):
    def detectar_formato(self, df):
        return 'identificador_unico' in df.to_string().lower()
    
    def detectar_cuenta(self, df):
        # Extraer tipo y número de cuenta del archivo
        return {
            'tipo_cuenta': 'ahorros',
            'numero_cuenta': '1234',
            'nombre_cuenta': 'Cuenta Nueva'
        }
    
    def extraer_datos(self, df):
        # Implementar lógica específica
        pass

Migración a base de datos (para app móvil):
Reemplazar UserManager (JSON) por SQLAlchemy/SQLite
Tablas sugeridas: usuarios, cuentas, transacciones, archivos_procesados
El modelo actual ya está preparado para ORM
API REST (FastAPI):
@app.post("/usuarios/{user_id}/cuentas")
async def crear_cuenta(user_id: str, cuenta: CuentaBancaria):
    ...

@app.post("/usuarios/{user_id}/procesar")
async def procesar_archivos(user_id: str, files: List[UploadFile]):
    # Similar al flujo actual pero con upload de archivos
    …

🗺️ Roadmap

Versión	Funcionalidad				Estado
v3.0	Sistema multi-cuenta			✅ Completado
v3.0	Gestión de archivos con historial	✅ Completado
v3.1	Soporte para Scotiabank y Global Bank	🔄 Pendiente
v3.2	Categorización con Machine Learning	🔄 Pendiente
v4.0	Interfaz web con Flask/FastAPI		🔄 Pendiente
v4.1	App móvil con React Native/Flutter	🔄 Pendiente
v4.2	Sincronización cloud (Firebase/AWS)	🔄 Pendiente

📞 Soporte y Contribución

¿Problemas con un banco?
Abre el archivo Excel y revisa las primeras 10 filas
Busca palabras únicas en encabezados (ej: "YAPPY", "DB POS", "COMPASS")
Comparte la estructura de columnas detectada

¿Ideas de mejora?
Sistema de presupuestos por categoría
Alertas de gastos inusuales
Predicción de saldo futuro
Comparativa mensual/año contra año

Versión: 3.0
Fecha: Marzo 2026
Autor: Sistema desarrollado para análisis financiero personal en Panamá
Licencia: Uso personal


Este README refleja completamente la arquitectura multi-cuenta, el flujo de procesamiento con gestión de archivos, y todas las mejoras de la versión 3.0.

