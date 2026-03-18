# 🏦 Sistema de Análisis Financiero Multi-Usuario - Panamá v2.0

## 📋 Tabla de Contenidos
1. [Novedades v2.0](#novedades-v20)
2. [Arquitectura Multi-Usuario](#arquitectura-multi-usuario)
3. [Instalación y Configuración](#instalación-y-configuración)
4. [Guía de Uso](#guía-de-uso)
5. [Estructura de Archivos](#estructura-de-archivos)
6. [Preparación para App Móvil](#preparación-para-app-móvil)

---

## 🆕 Novedades v2.0

### ✅ Problemas Resueltos
- **Rutas dinámicas**: Ya no hay rutas hardcodeadas `/mnt/kimi/upload/`
- **Multi-usuario**: Soporta múltiples perfiles con diferentes bancos
- **Configuración persistente**: Guarda preferencias en `usuarios_config.json`
- **Flexible por banco**: Un usuario puede usar 1, 2 o los 3 bancos

### 🏗️ Nueva Arquitectura
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   USER MANAGER  │────→│  CONFIGURACIÓN   │────→│   PARSER BANK   │
│  (alexis, juan) │     │  (bancos activos)│     │ (solo activos)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
│                                               │
└──────────────────┬────────────────────────────┘
▼
┌─────────────────┐
│  PROCESADOR     │
│  (carpeta user) │
└─────────────────┘

---

## 🏛️ Arquitectura Multi-Usuario

### Conceptos Clave

| Concepto | Descripción | Ejemplo |
|----------|-------------|---------|
| **Usuario** | Perfil único con configuración propia | `alexis_pineda` |
| **Bancos Activos** | Subset de bancos que usa el usuario | `["Banco General", "Banistmo"]` |
| **Carpeta de Datos** | Directorio donde busca archivos | `./datos_bancarios/alexis_pineda/` |
| **Procesador** | Motor inicializado por usuario | Solo ve sus bancos activos |

### Flujo de Datos

1. **Registro**: Usuario se registra con ID, nombre y bancos que usa
2. **Almacenamiento**: Copia sus archivos Excel a su carpeta asignada
3. **Procesamiento**: Sistema detecta automáticamente qué banco es cada archivo
4. **Análisis**: Consolida todos los datos en un reporte unificado

---

## 🚀 Instalación y Configuración

### Requisitos
```bash
pip install pandas numpy openpyxl xlrd

Configuración Inicial
Paso 1: Estructura de Carpetas
El sistema crea automáticamente esta estructura:
tu_proyecto/
├── Sistema de Analisis Financiero.py   # Código principal
├── usuarios_config.json                # Configuraciones (auto-generado)
├── datos_bancarios/                    # Carpetas de usuarios (auto-generado)
│   ├── alexis_pineda/
│   │   ├── reporte_financiero.json     # Reporte generado
│   │   └── [tus archivos Excel]
│   └── otro_usuario/
│       └── …

Paso 2: Configurar tu Usuario
Edita la función ejemplo_flujo_completo() o crea tu propio script:
from Sistema_de_Analisis_Financiero import UserManager, FinancialDataProcessor, FinancialAnalyzer

# 1. Crear tu perfil (solo la primera vez)
user_manager = UserManager()
usuario = user_manager.crear_usuario(
    user_id="alexis_pineda",           # ID único
    nombre="Alexis Pineda",            # Tu nombre
    bancos=["Banco General", "Banistmo", "BAC Credomatic"]  # Tus bancos
)

# 2. Inicializar procesador
processor = FinancialDataProcessor(user_manager)
processor.inicializar_para_usuario("alexis_pineda")

📖 Guía de Uso
Opción A: Procesar Archivos Específicos (Modo Actual)
Si tienes archivos dispersos en tu PC (tu caso actual):
# Rutas absolutas de tus archivos actuales
mis_archivos = [
    r"C:\Users\Alexis Pineda\Sistema de Analisis Financiero\ULTIMOS-MOVIMIENTOS-CUENTA-DE-AHORROS-2026-03-17.xlsx",
    r"C:\Users\Alexis Pineda\Sistema de Analisis Financiero\17_3_2026_MovimientosDeposito.xlsx",
    r"C:\Users\Alexis Pineda\Sistema de Analisis Financiero\Transacciones del mes.xls"
]

for archivo in mis_archivos:
    if os.path.exists(archivo):
        processor.procesar_archivo(archivo)
Opción B: Procesar Carpeta del Usuario (Recomendado para App)
Copia todos tus archivos a tu carpeta de usuario y procesa todo:

# Copia manual o programática los archivos a:
# ./datos_bancarios/alexis_pineda/

# Procesa todos los archivos de la carpeta
resultados = processor.procesar_carpeta_usuario()

# Resultados es un dict: {"Banco General": [transacciones], "Banistmo": [...]}

Opción C: Especificar Banco Manualmente
Si la detección automática falla:
processor.procesar_archivo(
    ruta_archivo="archivo.xlsx",
    banco_manual="Banco General"  # Forzar parser específico
)

📁 Estructura de Archivos
Para Desarrollo Local (Tu PC)
Antes (v1.0 - Problema):
# ❌ Rutas hardcodeadas que no existen en tu máquina
archivos = [
    '/mnt/kimi/upload/ULTIMOS-MOVIMIENTOS...',  # ERROR: No existe
]

Después (v2.0 - Solución):
# ✅ Rutas dinámicas o absolutas de tu PC
archivos = [
    r"C:\Users\Alexis Pineda\Sistema de Analisis Financiero\archivo.xlsx",
]
# O usa la carpeta del usuario automática

Para App Móvil (Futuro)
Cada usuario tendrá:
Backend: Configuración en base de datos (reemplaza usuarios_config.json)
Storage: Archivos en cloud storage (S3/Firebase) o local
API: Endpoints REST para subir archivos y obtener análisis

📱 Preparación para App Móvil
Cambios Realizados para Escalabilidad

Aspecto		Implementación Actual		Preparación Móvil
Usuarios	Clase ConfiguracionUsuario	Modelo Django/Firebase Auth
Persistencia	JSON local			PostgreSQL/Firestore
Archivos	Sistema de archivos local	AWS S3 / Firebase Storage
Procesamiento	Síncrono en Python		Celery workers / Cloud Functions
API		Directo en Python		FastAPI/Django REST Framework

Roadmap de Migración

Fase 1: Backend API (Inmediato)
# Ejemplo de endpoint FastAPI (futuro)
@app.post("/usuarios/{user_id}/procesar")
async def procesar_archivos(user_id: str, files: List[UploadFile]):
    processor = FinancialDataProcessor()
    processor.inicializar_para_usuario(user_id)
    # Procesar archivos subidos...
    return analyzer.exportar_reporte()

Fase 2: Base de Datos
Reemplazar UserManager (JSON) por SQLAlchemy/Django ORM
Tablas: Usuarios, Transacciones, ArchivosProcesados
Fase 3: App Móvil
Flutter/React Native: Cliente móvil
Upload: Seleccionar archivos Excel del teléfono
Visualización: Gráficos con los datos del reporte JSON

🔧 Configuración Avanzada
Agregar un Nuevo Banco (Desarrollador)
class NuevoBancoParser(BankParser):
    def __init__(self):
        super().__init__("Nuevo Banco")
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        # Buscar identificadores únicos
        texto = df.to_string().lower()
        return 'identificador unico' in texto
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        # Implementar lógica específica
        pass

# Registrar en FinancialDataProcessor.BANCOS_DISPONIBLES
Múltiples Archivos por Banco
El sistema soporta naturalmente múltiples extractos del mismo banco:
BG_enero_2026.xlsx
BG_febrero_2026.xlsx
BG_marzo_2026.xlsx
Se consolidan automáticamente en el análisis.
💡 Ejemplos de Uso por Escenario
Escenario 1: Alexis (3 Bancos)
user_manager.crear_usuario(
    user_id="alexis_pineda",
    nombre="Alexis Pineda", 
    bancos=["Banco General", "Banistmo", "BAC Credomatic"]
)
# Procesa archivos de los 3 bancos, análisis consolidado

Escenario 2: María (Solo BAC)
user_manager.crear_usuario(
    user_id="maria_gonzalez",
    nombre="María González",
    bancos=["BAC Credomatic"]
)
# Solo procesa archivos de BAC, ignora otros formatos

Escenario 3: Carlos (2 Bancos)
user_manager.crear_usuario(
    user_id="carlos_lopez",
    nombre="Carlos López",
    bancos=["Banco General", "Banistmo"]  # Sin BAC
)

⚠️ Notas de Seguridad
Archivos Sensibles: Los archivos Excel contienen datos bancarios reales
Encriptación: Para producción, encriptar usuarios_config.json
Validación: El sistema verifica que los archivos estén en la carpeta del usuario
Limpieza: Los datos raw se mantienen en memoria, no se guardan en disco (excepto reporte final)
🐛 Solución de Problemas
Error: "Archivo no encontrado"
# Verifica que la ruta exista
import os
print(os.path.exists(r"C:\Users\...\archivo.xlsx"))  # Debe dar True


Error: "Banco no detectado"
El archivo no tiene los identificadores esperados
Solución: Usar banco_manual="Nombre del Banco"
Error: "Usuario no encontrado"
Ejecutar user_manager.crear_usuario() primero
O verificar que el user_id sea correcto
Versión: 2.0
Fecha: Marzo 2026
Autor: Sistema desarrollado para análisis financiero personal en Panamá
Licencia: Uso personal


---

## Resumen de Cambios Clave

| Aspecto | Antes (v1.0) | Después (v2.0) |
|---------|-------------|----------------|
| **Rutas** | Hardcodeadas `/mnt/kimi/upload/` | Dinámicas o absolutas de tu PC |
| **Usuarios** | No existía | Sistema completo multi-usuario |
| **Bancos** | Todos obligatorios | Configurables por usuario (1-3) |
| **Persistencia** | Ninguna | JSON con configuraciones |
| **Carpetas** | Una sola | Una por usuario auto-creable |
| **Reporte** | Solo consola | JSON exportable con metadatos de usuario |
| **App Móvil** | No preparado | Arquitectura lista para migrar |

Para usarlo ahora mismo, simplemente copia el código Python, ajusta las rutas en `ejemplo_flujo_completo()` a tu carpeta `C:\Users\Alexis Pineda\Sistema de Analisis Financiero\`, y ejecuta. El sistema creará automáticamente tu usuario y carpeta de datos.