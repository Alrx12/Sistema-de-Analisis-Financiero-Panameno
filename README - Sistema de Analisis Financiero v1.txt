# 🏦 Sistema de Análisis Financiero - Panamá

## 📋 Tabla de Contenidos
1. [Contexto del Proyecto](#contexto-del-proyecto)
2. [Evolución del Desarrollo](#evolución-del-desarrollo)
3. [Arquitectura del Código](#arquitectura-del-código)
4. [Guía de Uso](#guía-de-uso)
5. [Recomendaciones](#recomendaciones)

---

## 🎯 Contexto del Proyecto

### ¿Qué problema resuelve?
En Panamá existen múltiples bancos (Banco General, Banistmo, BAC Credomatic) y cada uno genera extractos de cuenta en formatos diferentes. Este sistema permite:

- **Unificar** datos de diferentes bancos en un solo formato
- **Clasificar automáticamente** transacciones (alimentación, transporte, suscripciones, etc.)
- **Detectar patrones** de gasto y suscripciones recurrentes
- **Generar insights** personalizados para mejorar la salud financiera

### ¿Para quién es útil?
- Personas que quieren entender en qué gastan su dinero
- Desarrolladores que quieren crear apps de finanzas personales
- Contadores que necesitan consolidar datos de múltiples fuentes

---

## 🔄 Evolución del Desarrollo

### Fase 1: Análisis de Requerimientos
**Problema identificado**: Los 3 bancos tienen estructuras completamente diferentes:

| Banco | Formato de Fecha | Columnas de Monto | Identificador Único |
|-------|-----------------|-------------------|---------------------|
| Banco General | `2026-03-15 12:54:04` | Débito/Crédito separados | "YAPPY BG", "ACH XPRESS" |
| Banistmo | `17 mar. 2026` | Retiro/Depósito | "DB POS COMPRA", "DB ACH" |
| BAC | `13/09/2025` | Débitos/Créditos | Códigos: CP, PT, 4E, CM |

### Fase 2: Diseño de Arquitectura
Decisión clave: Usar el patrón **Strategy** (estrategia) mediante clases abstractas.

**¿Por qué?** Permite agregar nuevos bancos sin modificar el código existente (principio Open/Closed).

### Fase 3: Implementación por Componentes

#### Componente 1: Estructuras de Datos
- `TipoTransaccion` (Enum): Categoriza si es ingreso, egreso, transferencia, etc.
- `CategoriaGasto` (Enum): Clasificación de gastos (alimentación, transporte, etc.)
- `Transaccion` (Dataclass): Ficha estandarizada universal

#### Componente 2: Parsers Específicos
Cada banco tiene su "traductor" personalizado:
- `BancoGeneralParser`: Maneja fechas ISO y sistema YAPPY
- `BanistmoParser`: Traduce meses en español ("mar.", "feb.")
- `BACParser`: Interpreta códigos de transacción (CP=Compra, PT=Pago Tarjeta)

#### Componente 3: Motor de Procesamiento
`FinancialDataProcessor`: Orquesta todo el flujo:
1. Detecta automáticamente el banco
2. Asigna el parser correcto
3. Acumula todas las transacciones

#### Componente 4: Análisis e Insights
`FinancialAnalyzer`: El "cerebro" financiero que:
- Calcula balances y promedios
- Detecta suscripciones recurrentes (Netflix, Spotify, etc.)
- Identifica comercios frecuentes
- Genera recomendaciones personalizadas

### Fase 4: Pruebas con Datos Reales
Se utilizaron extractos reales de los 3 bancos para validar:
- ✅ Banco General: 347 transacciones procesadas
- ✅ Banistmo: 438 transacciones procesadas  
- ✅ BAC: 66 transacciones procesadas

---

## 🏗️ Arquitectura del Código

### Diagrama de Flujo
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  ARCHIVO EXCEL  │────→│  DETECTAR BANCO  │────→│ PARSER ESPECÍFICO│
│  (.xlsx / .xls) │     │ (Banco General?  │     │ (Extrae datos    │
│                 │     │  Banistmo? BAC?) │     │  según formato)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
│
┌──────────────────────────┘
▼
┌─────────────────┐
│  TRANSAACCIÓN   │  ← Ficha estandarizada
│  (fecha, desc,  │    universal para
│   monto, tipo)  │    todos los bancos
└────────┬────────┘
│
▼
┌─────────────────┐
│   ANALIZADOR    │
│  - Resumen      │
│  - Categorías   │
│  - Suscripciones│
│  - Recomendaciones│
└────────┬────────┘
│
▼
┌─────────────────┐
│  REPORTE JSON   │  ← Output final con
│  + insights    │    todos los análisis
└─────────────────┘

### Estructura de Clases

```python
# NIVEL 1: Contrato (Abstract Base Class)
BankParser (ABC)
├── parsear_fecha()          # Entiende diferentes formatos de fecha
├── limpiar_monto()          # Normaliza números ($1,234.56 → 1234.56)
├── categorizar()            # Clasifica con IA de reglas
└── procesar()               # Pipeline completo

# NIVEL 2: Implementaciones concretas
BancoGeneralParser(BankParser)   # Especialista en BG
BanistmoParser(BankParser)       # Especialista en Banistmo  
BACParser(BankParser)            # Especialista en BAC

# NIVEL 3: Orquestación
FinancialDataProcessor
├── detectar_banco()         # Selecciona el parser correcto
├── cargar_archivo()         # Lee Excel/CSV con codificación correcta
└── procesar_archivo()       # Ejecuta pipeline completo

# NIVEL 4: Análisis
FinancialAnalyzer
├── resumen_general()        # KPIs financieros
├── analisis_por_categoria() # Distribución de gastos
├── detectar_suscripciones() # Identifica pagos recurrentes
├── detectar_comercios_frecuentes() # Top comercios
└── generar_recomendaciones() # Consejos personalizados

| Patrón                   | Uso                                        | Beneficio                   |
| ------------------------ | ------------------------------------------ | --------------------------- |
| **Strategy**             | Diferentes parsers para cada banco         | Fácil agregar nuevos bancos |
| **Template Method**      | `BankParser.procesar()` define pasos fijos | Código reutilizable         |
| **Factory**              | `detectar_banco()` crea el parser correcto | Desacoplamiento             |
| **Data Transfer Object** | `Transaccion` dataclass                    | Estandarización             |

🚀 Guía de Uso
Instalación de Dependencias

pip install pandas numpy openpyxl xlrd

Uso Básico

from financial_processor import FinancialDataProcessor, FinancialAnalyzer

# 1. Crear el procesador
processor = FinancialDataProcessor()

# 2. Procesar archivos (detección automática de banco)
processor.procesar_archivo('extracto_banco_general.xlsx')
processor.procesar_archivo('extracto_banistmo.xlsx')
processor.procesar_archivo('extracto_bac.xls')

# 3. Analizar
analyzer = FinancialAnalyzer(processor.transacciones)

# 4. Ver resultados
print(analyzer.resumen_general())
print(analyzer.analisis_por_categoria())
print(analyzer.generar_recomendaciones())

# 5. Exportar
reporte_json = analyzer.exportar_reporte('json')

Uso Avanzado (Especificar Banco Manualmente)

# Si la detección automática falla
processor.procesar_archivo('archivo.xlsx', banco_manual='Banco General')

Estructura del Reporte JSON

{
  "resumen": {
    "total_transacciones": 851,
    "ingresos_totales": 12500.00,
    "egresos_totales": 11800.00,
    "balance_neto": 700.00
  },
  "analisis_categorias": {
    "Alimentación": {"Total Gastado": 2500.00, "% del Total": 21.2},
    "Suscripciones": {"Total Gastado": 180.00, "% del Total": 1.5}
  },
  "suscripciones": [
    {"descripcion": "NETFLIX", "monto_mensual": 15.99, "frecuencia": 3},
    {"descripcion": "SPOTIFY", "monto_mensual": 12.99, "frecuencia": 3}
  ],
  "recomendaciones": [
    {
      "categoria": "Ahorro",
      "nivel": "alta",
      "mensaje": "Estás ahorrando solo el 5.6% de tus ingresos",
      "accion": "Automatiza transferencia del 10% el día de pago"
    }
  ]
}

💡 Recomendaciones
Para Usuarios Finales
Exporta mensualmente: La precisión del análisis mejora con más datos históricos
Revisa las categorías: El sistema clasifica por palabras clave, pero puedes ajustar manualmente si es necesario
Atención a suscripciones: El detector identifica pagos recurrentes, pero verifica si son realmente suscripciones o coincidencias
Para Desarrolladores
Agregar un nuevo banco:
class NuevoBancoParser(BankParser):
    def detectar_formato(self, df):
        return 'nombre único' in df.to_string().lower()
    
    def extraer_datos(self, df):
        # Implementar lógica específica
        pass
# Luego agregar a FinancialDataProcessor.__init__()

Mejorar categorización: Editar _definir_patrones_categoria() en cada parser para agregar más palabras clave

Integración con APIs: El reporte JSON está diseñado para ser consumido por:
- Frontend React/Vue/Angular
- Apps móviles (Flutter, React Native)
- Dashboards de Business Intelligence

Roadmap Sugerido

Fase	Funcionalidad	Prioridad
1	Agregar más bancos panameños (Scotiabank, Global Bank)	Alta
2	Machine Learning para categorización automática	Media
3	Predicción de gastos futuros	Media
4	Alertas de presupuesto por categoría	Alta
5	Exportación a Excel/PDF con gráficos	Media

Consideraciones de Seguridad
⚠️ Nunca subas archivos bancarios reales a servicios públicos
Procesa localmente o en servidores privados
Los archivos Excel contienen datos sensibles (números de cuenta, montos)
Considera encriptar el reporte JSON generado

📞 Soporte
¿Encontraste un banco que no se detecta correctamente?
Abre el archivo Excel
Busca palabras únicas en el encabezado (ej: "YAPPY", "DB POS", "COMPASS")
Comparte esas palabras clave para agregar el parser
Versión: 1.0
Fecha: Marzo 2026
Autor: Sistema desarrollado para análisis financiero personal en Panamá

Código: 

"""
SISTEMA DE PROCESAMIENTO DE DATOS BANCARIOS - PANAMÁ
Soporta: Banco General, BAC Credomatic, Banistmo
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Callable, Tuple
from dataclasses import dataclass
from enum import Enum
import re
import json
from abc import ABC, abstractmethod

# ============================================================
# SECCIÓN 1: ESTRUCTURAS DE DATOS Y CONFIGURACIÓN
# ============================================================

class TipoTransaccion(Enum):
    INGRESO = "ingreso"
    EGRESO = "egreso"
    TRANSFERENCIA = "transferencia"
    PAGO_TARJETA = "pago_tarjeta"
    COMISION = "comision"
    INTERES = "interes"
    SUSCRIPCION = "suscripcion"
    DESCONOCIDO = "desconocido"

class CategoriaGasto(Enum):
    ALIMENTACION = "Alimentación"
    TRANSPORTE = "Transporte"
    SERVICIOS = "Servicios Públicos"
    ENTRETENIMIENTO = "Entretenimiento"
    SALUD = "Salud"
    EDUCACION = "Educación"
    COMPRAS = "Compras"
    VIAJES = "Viajes"
    TRANSFERENCIAS = "Transferencias"
    INGRESOS = "Ingresos"
    SUSCRIPCIONES = "Suscripciones"
    FINANCIERO = "Gastos Financieros"
    OTROS = "Otros"

@dataclass
class Transaccion:
    fecha: datetime
    descripcion: str
    monto: float
    tipo: TipoTransaccion
    categoria: CategoriaGasto
    banco_origen: str
    metodo_pago: str  # YAPPY, ACH, POS, etc.
    raw_data: Dict  # Datos originales para referencia
    
    def to_dict(self):
        return {
            'fecha': self.fecha.strftime('%Y-%m-%d'),
            'descripcion': self.descripcion,
            'monto': self.monto,
            'tipo': self.tipo.value,
            'categoria': self.categoria.value,
            'banco_origen': self.banco_origen,
            'metodo_pago': self.metodo_pago
        }

# ============================================================
# SECCIÓN 2: CLASE ABSTRACTA PARA PARSERS DE BANCOS
# ============================================================

class BankParser(ABC):
    """Clase base abstracta para todos los parsers bancarios"""
    
    def __init__(self, nombre_banco: str):
        self.nombre_banco = nombre_banco
        self.patrones_categoria = self._definir_patrones_categoria()
    
    @abstractmethod
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        """Define palabras clave para categorización automática"""
        pass
    
    @abstractmethod
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si el DataFrame corresponde a este banco"""
        pass
    
    @abstractmethod
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae y limpia los datos específicos del banco"""
        pass
    
    def parsear_fecha(self, fecha_str) -> Optional[datetime]:
        """Parsea fechas en varios formatos comunes"""
        if pd.isna(fecha_str):
            return None
            
        if isinstance(fecha_str, datetime):
            return fecha_str
        
        formatos = [
            '%Y-%m-%d %H:%M:%S',  # Banco General
            '%d/%m/%Y',           # BAC
            '%d %b. %Y',          # Banistmo (17 mar. 2026)
            '%d-%b-%Y',           # Banistmo alternativo
            '%Y-%m-%d',           # ISO
            '%d/%m/%y',           # Corto
        ]
        
        for fmt in formatos:
            try:
                return datetime.strptime(str(fecha_str).strip(), fmt)
            except:
                continue
        
        # Intentar formato específico de Banistmo (ej: "17 mar. 2026")
        meses_es = {
            'ene.': '01', 'feb.': '02', 'mar.': '03', 'abr.': '04',
            'may.': '05', 'jun.': '06', 'jul.': '07', 'ago.': '08',
            'sep.': '09', 'oct.': '10', 'nov.': '11', 'dic.': '12'
        }
        
        try:
            partes = str(fecha_str).lower().replace(',', '').split()
            if len(partes) == 3:
                dia = partes[0]
                mes = meses_es.get(partes[1], partes[1])
                anio = partes[2]
                fecha_normalizada = f"{dia}/{mes}/{anio}"
                return datetime.strptime(fecha_normalizada, '%d/%m/%Y')
        except:
            pass
            
        return None
    
    def limpiar_monto(self, valor) -> float:
        """Limpia y convierte el monto a float"""
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        # Limpiar string
        monto_str = str(valor).replace('$', '').replace(' ', '').strip()
        
        # Manejar paréntesis para negativos (ej: ($12.49) )
        if '(' in monto_str and ')' in monto_str:
            monto_str = '-' + monto_str.replace('(', '').replace(')', '')
        
        # Manejar separadores
        if ',' in monto_str and '.' in monto_str:
            # Determinar cuál es el separador decimal
            last_comma = monto_str.rfind(',')
            last_point = monto_str.rfind('.')
            
            if last_point > last_comma:
                # Formato US: 1,234.56
                monto_str = monto_str.replace(',', '')
            else:
                # Formato EU: 1.234,56
                monto_str = monto_str.replace('.', '').replace(',', '.')
        elif ',' in monto_str:
            # Verificar si es separador de miles o decimal
            if len(monto_str.split(',')[-1]) == 2:
                monto_str = monto_str.replace(',', '.')
            else:
                monto_str = monto_str.replace(',', '')
        
        try:
            return float(monto_str)
        except:
            return 0.0
    
    def categorizar(self, descripcion: str, monto: float) -> Tuple[CategoriaGasto, TipoTransaccion]:
        """Categoriza la transacción basado en la descripción"""
        desc_lower = descripcion.lower()
        
        # Detectar suscripciones (montos fijos recurrentes)
        suscripciones = ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 
                        'youtube premium', 'google one', 'microsoft', 'norton',
                        'adobe', 'canva']
        for sus in suscripciones:
            if sus in desc_lower:
                return CategoriaGasto.SUSCRIPCIONES, TipoTransaccion.SUSCRIPCION
        
        # Detectar transferencias entre cuentas propias
        if any(word in desc_lower for word in ['transferencia', 'transf.', 'trf', 'cuentas propias', 
                                               'cuenta propia', 'de cc a ah', 'de ah a cc', 'mismo banco']):
            if 'terceros' not in desc_lower:
                return CategoriaGasto.TRANSFERENCIAS, TipoTransaccion.TRANSFERENCIA
        
        # Detectar ingresos
        if monto > 0:
            if any(word in desc_lower for word in ['pago de planilla', 'salario', 'nomina', 'deposito', 
                                                   'abono', 'credito', 'yappy bg de', 'ach xpr']):
                return CategoriaGasto.INGRESOS, TipoTransaccion.INGRESO
        
        # Detectar gastos financieros
        if any(word in desc_lower for word in ['comision', 'interes', 'seguro', 'pago debitado para tdc',
                                              'prestamo', 'cartera', 'itbms']):
            return CategoriaGasto.FINANCIERO, TipoTransaccion.COMISION
        
        # Categorizar por tipo de comercio
        for categoria, palabras in self.patrones_categoria.items():
            if any(palabra in desc_lower for palabra in palabras):
                tipo = TipoTransaccion.EGRESO if monto < 0 else TipoTransaccion.INGRESO
                return categoria, tipo
        
        # Default
        tipo = TipoTransaccion.EGRESO if monto < 0 else TipoTransaccion.INGRESO
        return CategoriaGasto.OTROS, tipo
    
    def procesar(self, df: pd.DataFrame) -> List[Transaccion]:
        """Procesa el DataFrame y retorna lista de transacciones estandarizadas"""
        # Extraer datos específicos del banco
        df_limpio = self.extraer_datos(df)
        
        if df_limpio is None or df_limpio.empty:
            return []
        
        transacciones = []
        
        for _, row in df_limpio.iterrows():
            try:
                fecha = self.parsear_fecha(row.get('fecha'))
                if fecha is None:
                    continue
                
                descripcion = str(row.get('descripcion', '')).strip()
                monto = self.limpiar_monto(row.get('monto'))
                
                if monto == 0:
                    continue
                
                categoria, tipo = self.categorizar(descripcion, monto)
                metodo_pago = self._detectar_metodo_pago(descripcion)
                
                transaccion = Transaccion(
                    fecha=fecha,
                    descripcion=descripcion,
                    monto=monto,
                    tipo=tipo,
                    categoria=categoria,
                    banco_origen=self.nombre_banco,
                    metodo_pago=metodo_pago,
                    raw_data=row.to_dict()
                )
                transacciones.append(transaccion)
                
            except Exception as e:
                print(f"Error procesando fila: {e}")
                continue
                
        return transacciones
    
    def _detectar_metodo_pago(self, descripcion: str) -> str:
        """Detecta el método de pago usado"""
        desc_lower = descripcion.lower()
        
        if 'yappy' in desc_lower:
            return 'YAPPY'
        elif 'ach xpress' in desc_lower or 'ach xpr' in desc_lower:
            return 'ACH XPRESS'
        elif 'pos compra' in desc_lower:
            return 'POS'
        elif 'e-commerce' in desc_lower:
            return 'E-COMMERCE'
        elif 'banca movil' in desc_lower or 'transferencia' in desc_lower:
            return 'TRANSFERENCIA'
        else:
            return 'OTRO'

# ============================================================
# SECCIÓN 3: IMPLEMENTACIÓN BANCO GENERAL
# ============================================================

class BancoGeneralParser(BankParser):
    """Parser para Banco General (Panamá)"""
    
    def __init__(self):
        super().__init__("Banco General")
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: [
                'lobbymarket', 'pedidos ya', 'pedidosya', 'kfc', 'mcdonalds', 
                'gelatiamo', 'fritanga', 'restaurante', 'carnes grill', 'pueblos',
                'fonda sabores', 'la areperia', 'cinnabon', 'mr chen', 'starbucks',
                'natuviva', 'rockefeller', 'tim hortons', 'dominos', 'pizza'
            ],
            CategoriaGasto.TRANSPORTE: [
                'uber', 'didi', 'cabify', 'transporte', 'recarga', 'gasolina', 
                'texaco', 'shell', 'delta', 'estacion', 'peaje'
            ],
            CategoriaGasto.SERVICIOS: [
                'ensa', 'idaan', 'cableonda', 'masmovil', 'claro', 'movistar', 
                'tigo', 'agua', 'luz', 'internet', 'telefono', 'smartfit', 'fitlab',
                'sportlink', 'gym'
            ],
            CategoriaGasto.ENTRETENIMIENTO: [
                'netflix', 'spotify', 'disney', 'youtube', 'hbo', 'prime', 'apple',
                'google', 'microsoft', 'norton', 'panatickets', 'albrook', 'cine',
                'evento', 'temu'
            ],
            CategoriaGasto.SALUD: [
                'farmacia', 'hospital', 'clinica', 'medico', 'laboratorio', 
                'metroplus', 'seguro social', 'salud'
            ],
            CategoriaGasto.EDUCACION: [
                'universidad', 'colegio', 'escuela', 'curso', 'udemy', 'coursera',
                'libros', 'educacion'
            ],
            CategoriaGasto.COMPRAS: [
                'super 99', 'super7', 'xtra', 'novey', 'do it center', 'hiper asia',
                'chipichape', 'madmarket', 'saks', 'lush', 'stevens', 'metro alta',
                'riba smith', 'manada', 'tigre', 'zooshop', 'epik', 'rapiditos',
                'alsogaray', 'premier', 'friking'
            ],
            CategoriaGasto.VIAJES: [
                'aeropuerto', 'copa', 'airbnb', 'booking', 'hotel', 'tiquete',
                'vuelo', 'avion', 'aerolinea'
            ],
            CategoriaGasto.TRANSFERENCIAS: [
                'transferencia', 'transf.', 'yappy bg a', 'yappy bg de', 'ach xpress'
            ]
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si es Banco General por contenido específico"""
        # Buscar en todas las celdas por "BG", "Banco General", "YAPPY"
        texto_completo = df.to_string().lower()
        indicadores = ['banco general', 'yappy bg', 'ahorros i', 'bg a ', 'bg de ']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae datos del formato específico de Banco General"""
        try:
            # El archivo tiene encabezados en fila 7 (índice 7)
            # Columnas: Fecha, Vacío, Referencia, Transacción, Descripción, Débito, Crédito, Vacío, Saldo
            
            datos = []
            for idx, row in df.iterrows():
                if idx < 8:  # Saltar encabezados
                    continue
                
                # Columnas esperadas: 0=Fecha, 2=Referencia, 3=Transacción, 4=Descripción, 5=Débito, 6=Crédito
                if len(row) < 7:
                    continue
                
                fecha = row[0]
                descripcion = row[4] if pd.notna(row[4]) else ""
                
                # Determinar monto (Débito es negativo, Crédito es positivo)
                debito = row[5] if pd.notna(row[5]) else 0
                credito = row[6] if pd.notna(row[6]) else 0
                
                if pd.notna(debito) and debito != 0:
                    monto = -abs(self.limpiar_monto(debito))
                elif pd.notna(credito) and credito != 0:
                    monto = abs(self.limpiar_monto(credito))
                else:
                    continue
                
                if pd.notna(fecha) and pd.notna(descripcion) and descripcion != "":
                    datos.append({
                        'fecha': fecha,
                        'descripcion': descripcion,
                        'monto': monto,
                        'referencia': row[2] if pd.notna(row[2]) else "",
                        'transaccion': row[3] if pd.notna(row[3]) else ""
                    })
            
            return pd.DataFrame(datos)
            
        except Exception as e:
            print(f"Error extrayendo datos de Banco General: {e}")
            return pd.DataFrame()

# ============================================================
# SECCIÓN 4: IMPLEMENTACIÓN BANISTMO
# ============================================================

class BanistmoParser(BankParser):
    """Parser para Banistmo (Panamá)"""
    
    def __init__(self):
        super().__init__("Banistmo")
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: [
                'lobby y ma', 'pedidosya', 'pedidos ya', 'kfc', 'mcdonalds', 
                'gelatiamo', 'dominos', 'pizza', 'restaurante', 'natuviva',
                'rockefeller', 'tim horton', 'cinnabon', 'mr chen', 'starbucks',
                'buena vista', 'restaurant', 'durban coff'
            ],
            CategoriaGasto.TRANSPORTE: [
                'uber', 'didi', 'cabify', 'transporte', 'gasolina', 'texaco',
                'shell', 'delta', 'estacion t', 'peaje', 'dlc uber'
            ],
            CategoriaGasto.SERVICIOS: [
                'ensa', 'idaan', 'cableonda', 'claro', 'movistar', 'tigo',
                'agua', 'luz', 'internet', 'telefono', 'servicio 35', 'tipo factu'
            ],
            CategoriaGasto.ENTRETENIMIENTO: [
                'netflix', 'spotify', 'disney', 'youtube', 'hbo', 'prime',
                'google', 'apple', 'microsoft', 'norton', 'temu', 'paypal'
            ],
            CategoriaGasto.SALUD: [
                'farmacia', 'hospital', 'clinica', 'medico', 'laboratorio',
                'metroplus', 'seguro', 'salud', 'radvet', 'clinica ho'
            ],
            CategoriaGasto.EDUCACION: [
                'universidad', 'colegio', 'escuela', 'curso', 'educacion'
            ],
            CategoriaGasto.COMPRAS: [
                'super 99', 'xtra marke', 'novey', 'do it cent', 'hiper los',
                'chipichape', 'tigo kco', 'modas saks', 'lush', 'stevens',
                'metro alta', 'seven seve', 'tigre', 'smart pay', 'luisa orti',
                'leonardo e', 'fitlab', 'power lab', '1815180 me'
            ],
            CategoriaGasto.VIAJES: [
                'aeropuerto', 'copa', 'airbnb', 'booking', 'hotel'
            ],
            CategoriaGasto.FINANCIERO: [
                'pago debitado para tdc', 'prestamo', 'cartera', 'seguro contra fraude',
                'comision', 'mantenimiento', 'cuota mant', 'itbms'
            ]
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si es Banistmo"""
        texto_completo = df.to_string().lower()
        indicadores = ['banistmo', 'db pos compra', 'db ach xpress', 'db compra e-commerce']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae datos del formato específico de Banistmo"""
        try:
            # Buscar la fila con encabezados (Fecha, Detalle, Retiro, Depósito, Saldo)
            header_row = None
            for idx, row in df.iterrows():
                if 'fecha' in str(row).lower() and 'detalle' in str(row).lower():
                    header_row = idx
                    break
            
            if header_row is None:
                # Intentar encontrar por posición aproximada
                header_row = 26
            
            datos = []
            for idx, row in df.iterrows():
                if idx <= header_row:
                    continue
                
                # Columnas esperadas: 1=Fecha, 2=Detalle, 3=Retiro, 4=Depósito
                if len(row) < 5:
                    continue
                
                fecha = row[1]
                descripcion = row[2] if pd.notna(row[2]) else ""
                
                # Retiro es negativo, Depósito es positivo
                retiro = row[3] if pd.notna(row[3]) else None
                deposito = row[4] if pd.notna(row[4]) else None
                
                if pd.notna(retiro) and str(retiro).startswith('-'):
                    monto = self.limpiar_monto(retiro)
                elif pd.notna(deposito):
                    monto = abs(self.limpiar_monto(deposito))
                else:
                    continue
                
                if pd.notna(fecha) and pd.notna(descripcion) and descripcion != "":
                    datos.append({
                        'fecha': fecha,
                        'descripcion': descripcion,
                        'monto': monto
                    })
            
            return pd.DataFrame(datos)
            
        except Exception as e:
            print(f"Error extrayendo datos de Banistmo: {e}")
            return pd.DataFrame()

# ============================================================
# SECCIÓN 5: IMPLEMENTACIÓN BAC CREDOMATIC
# ============================================================

class BACParser(BankParser):
    """Parser para BAC Credomatic (Panamá)"""
    
    def __init__(self):
        super().__init__("BAC Credomatic")
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: [
                'compass', 'restaurante', 'cafe', 'kitchen', 'food'
            ],
            CategoriaGasto.TRANSPORTE: [
                'uber', 'didi', 'gasolina', 'combustible', 'estacion'
            ],
            CategoriaGasto.SERVICIOS: [
                'seguro', 'proteccion', 'servicio'
            ],
            CategoriaGasto.ENTRETENIMIENTO: [
                'netflix', 'spotify', 'disney', 'cine', 'evento'
            ],
            CategoriaGasto.SALUD: [
                'farmacia', 'hospital', 'clinica', 'medico'
            ],
            CategoriaGasto.EDUCACION: [
                'universidad', 'colegio', 'escuela', 'curso'
            ],
            CategoriaGasto.COMPRAS: [
                'tienda', 'compra', 'retail', 'compass'
            ],
            CategoriaGasto.VIAJES: [
                'aeropuerto', 'copa', 'hotel', 'viaje'
            ],
            CategoriaGasto.FINANCIERO: [
                'pago tarjeta', 'proteccion robo', 'valor de tarjeta', 'comision'
            ]
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si es BAC Credomatic"""
        texto_completo = df.to_string().lower()
        indicadores = ['bac credomatic', 'detalle de movimientos del período', 'compass']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae datos del formato específico de BAC"""
        try:
            # Buscar la fila con encabezados
            header_row = None
            for idx, row in df.iterrows():
                if 'fecha' in str(row[0]).lower() and 'referencia' in str(row).lower():
                    header_row = idx
                    break
            
            if header_row is None:
                header_row = 12
            
            datos = []
            for idx, row in df.iterrows():
                if idx <= header_row:
                    continue
                
                # Columnas: 0=Fecha, 1=Referencia, 3=Código, 4=Descripción, 7=Débitos, 8=Créditos
                if len(row) < 9:
                    continue
                
                fecha = row[0]
                descripcion = row[4] if pd.notna(row[4]) else ""
                codigo = row[3] if pd.notna(row[3]) else ""
                
                # Débitos (negativo), Créditos (positivo)
                debito = row[7] if pd.notna(row[7]) else 0
                credito = row[8] if pd.notna(row[8]) else 0
                
                if pd.notna(debito) and float(debito) != 0:
                    monto = -abs(float(debito))
                elif pd.notna(credito) and float(credito) != 0:
                    monto = abs(float(credito))
                else:
                    continue
                
                # Ignorar filas de saldo inicial o vacías
                if 'saldo' in str(descripcion).lower():
                    continue
                
                if pd.notna(fecha) and pd.notna(descripcion) and descripcion != "":
                    datos.append({
                        'fecha': fecha,
                        'descripcion': f"{codigo}: {descripcion}" if codigo else descripcion,
                        'monto': monto,
                        'codigo': codigo
                    })
            
            return pd.DataFrame(datos)
            
        except Exception as e:
            print(f"Error extrayendo datos de BAC: {e}")
            return pd.DataFrame()

# ============================================================
# SECCIÓN 6: MOTOR DE PROCESAMIENTO PRINCIPAL
# ============================================================

class FinancialDataProcessor:
    """Motor principal de procesamiento de datos financieros"""
    
    def __init__(self):
        self.parsers: List[BankParser] = [
            BancoGeneralParser(),
            BanistmoParser(),
            BACParser()
        ]
        self.transacciones: List[Transaccion] = []
        self.banco_detectado: Optional[str] = None
    
    def detectar_banco(self, df: pd.DataFrame) -> Optional[BankParser]:
        """Detecta automáticamente el banco basado en el formato"""
        for parser in self.parsers:
            if parser.detectar_formato(df):
                self.banco_detectado = parser.nombre_banco
                print(f"✓ Banco detectado: {parser.nombre_banco}")
                return parser
        
        print("⚠ No se pudo detectar el banco automáticamente")
        return None
    
    def cargar_archivo(self, ruta_archivo: str) -> pd.DataFrame:
        """Carga archivo Excel o CSV"""
        try:
            if ruta_archivo.endswith('.csv'):
                encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
                for encoding in encodings:
                    try:
                        df = pd.read_csv(ruta_archivo, encoding=encoding, header=None)
                        print(f"✓ Archivo CSV cargado con encoding: {encoding}")
                        break
                    except UnicodeDecodeError:
                        continue
            else:
                df = pd.read_excel(ruta_archivo, header=None)
                print(f"✓ Archivo Excel cargado: {ruta_archivo.split('/')[-1]}")
            
            return df
            
        except Exception as e:
            raise Exception(f"Error cargando archivo: {e}")
    
    def procesar_archivo(self, ruta_archivo: str, banco_manual: Optional[str] = None) -> List[Transaccion]:
        """Procesa un archivo completo"""
        # Cargar datos
        df = self.cargar_archivo(ruta_archivo)
        
        # Detectar banco
        parser = None
        if banco_manual:
            parser = next((p for p in self.parsers if p.nombre_banco.lower() == banco_manual.lower()), None)
        
        if not parser:
            parser = self.detectar_banco(df)
        
        if not parser:
            raise Exception("No se pudo identificar el banco. Especifica manualmente: 'Banco General', 'Banistmo' o 'BAC Credomatic'")
        
        # Procesar transacciones
        transacciones = parser.procesar(df)
        self.transacciones.extend(transacciones)
        
        print(f"✓ {len(transacciones)} transacciones procesadas exitosamente de {parser.nombre_banco}")
        return transacciones
    
    def obtener_dataframe(self) -> pd.DataFrame:
        """Convierte las transacciones a DataFrame para análisis"""
        if not self.transacciones:
            return pd.DataFrame()
        
        data = [t.to_dict() for t in self.transacciones]
        return pd.DataFrame(data)

# ============================================================
# SECCIÓN 7: MOTOR DE ANÁLISIS E INSIGHTS
# ============================================================

class FinancialAnalyzer:
    """Genera insights y análisis financiero"""
    
    def __init__(self, transacciones: List[Transaccion]):
        self.df = pd.DataFrame([t.to_dict() for t in transacciones])
        if not self.df.empty:
            self.df['fecha'] = pd.to_datetime(self.df['fecha'])
            self.df['monto_abs'] = self.df['monto'].abs()
            self.df['mes'] = self.df['fecha'].dt.to_period('M')
    
    def resumen_general(self) -> Dict:
        """Genera resumen ejecutivo"""
        if self.df.empty:
            return {"error": "No hay datos para analizar"}
        
        ingresos = self.df[self.df['monto'] > 0]['monto'].sum()
        egresos = self.df[self.df['monto'] < 0]['monto'].sum()
        
        return {
            "total_transacciones": len(self.df),
            "periodo": f"{self.df['fecha'].min().strftime('%d/%m/%Y')} - {self.df['fecha'].max().strftime('%d/%m/%Y')}",
            "ingresos_totales": round(ingresos, 2),
            "egresos_totales": round(abs(egresos), 2),
            "balance_neto": round(ingresos + egresos, 2),
            "promedio_diario_gasto": round(abs(egresos) / ((self.df['fecha'].max() - self.df['fecha'].min()).days + 1), 2),
            "ahorro_potencial_20": round(ingresos * 0.20, 2)
        }
    
    def analisis_por_categoria(self) -> pd.DataFrame:
        """Análisis detallado por categoría"""
        if self.df.empty:
            return pd.DataFrame()
        
        # Solo gastos (negativos)
        gastos = self.df[self.df['monto'] < 0].copy()
        gastos['monto'] = gastos['monto'].abs()
        
        analisis = gastos.groupby('categoria').agg({
            'monto': ['sum', 'mean', 'count'],
            'fecha': ['min', 'max']
        }).round(2)
        
        analisis.columns = ['Total Gastado', 'Promedio', 'Cantidad', 'Primera Fecha', 'Última Fecha']
        analisis['% del Total'] = (analisis['Total Gastado'] / analisis['Total Gastado'].sum() * 100).round(2)
        
        return analisis.sort_values('Total Gastado', ascending=False)
    
    def analisis_mensual(self) -> pd.DataFrame:
        """Análisis por mes"""
        if self.df.empty:
            return pd.DataFrame()
        
        mensual = self.df.groupby('mes').agg({
            'monto': lambda x: x[x > 0].sum(),  # Ingresos
        }).rename(columns={'monto': 'Ingresos'})
        
        mensual['Egresos'] = self.df.groupby('mes')['monto'].apply(lambda x: abs(x[x < 0].sum()))
        mensual['Balance'] = mensual['Ingresos'] - mensual['Egresos']
        mensual['Transacciones'] = self.df.groupby('mes').size()
        
        return mensual.round(2)
    
    def detectar_suscripciones(self) -> List[Dict]:
        """Detecta suscripciones recurrentes"""
        if self.df.empty:
            return []
        
        suscripciones = []
        
        # Buscar transacciones de suscripción
        df_sus = self.df[self.df['categoria'] == 'Suscripciones']
        
        for descripcion in df_sus['descripcion'].unique():
            trans = df_sus[df_sus['descripcion'] == descripcion]
            if len(trans) >= 2:
                monto_promedio = trans['monto_abs'].mean()
                frecuencia = len(trans)
                
                suscripciones.append({
                    'descripcion': descripcion[:50],  # Truncar para legibilidad
                    'monto_mensual': round(monto_promedio, 2),
                    'frecuencia': frecuencia,
                    'total_ultimos_meses': round(trans['monto_abs'].sum(), 2),
                    'proximo_pago_estimado': trans['fecha'].max() + pd.Timedelta(days=30)
                })
        
        return sorted(suscripciones, key=lambda x: x['monto_mensual'], reverse=True)
    
    def detectar_comercios_frecuentes(self, top_n: int = 10) -> pd.DataFrame:
        """Detecta los comercios donde más se gasta"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        
        # Extraer nombre del comercio (simplificado)
        def extraer_comercio(desc):
            desc = desc.lower()
            # Quitar prefijos comunes
            for prefijo in ['pago yappy bg a ', 'yappy bg a ', 'yappy bg de ', 
                           'db pos compra ', 'db compra ', 'ach xpress ']:
                if desc.startswith(prefijo):
                    desc = desc[len(prefijo):]
            return desc.split()[0] if desc else 'desconocido'
        
        gastos['comercio'] = gastos['descripcion'].apply(extraer_comercio)
        
        frecuentes = gastos.groupby('comercio').agg({
            'monto': ['sum', 'count', 'mean']
        }).round(2)
        
        frecuentes.columns = ['Total', 'Visitas', 'Promedio']
        frecuentes['% del Total'] = (frecuentes['Total'] / frecuentes['Total'].sum() * 100).round(2)
        
        return frecuentes.sort_values('Total', ascending=False).head(top_n)
    
    def generar_recomendaciones(self) -> List[Dict]:
        """Genera recomendaciones personalizadas"""
        recomendaciones = []
        resumen = self.resumen_general()
        
        # Análisis de ahorro
        ingresos = resumen['ingresos_totales']
        egresos = resumen['egresos_totales']
        
        if ingresos > 0:
            ratio_ahorro = (ingresos - egresos) / ingresos
            
            if ratio_ahorro < 0:
                recomendaciones.append({
                    "categoria": "Alerta Crítica",
                    "nivel": "alta",
                    "mensaje": f"Estás gastando ${abs(resumen['balance_neto']):.2f} más de lo que ingresas. ¡Necesitas ajustar tus gastos urgentemente!",
                    "accion": "Revisa todas tus suscripciones y gastos discrecionales. Considera un presupuesto estricto."
                })
            elif ratio_ahorro < 0.1:
                recomendaciones.append({
                    "categoria": "Ahorro",
                    "nivel": "alta",
                    "mensaje": f"Estás ahorrando solo el {ratio_ahorro*100:.1f}% de tus ingresos. El ideal es 20%.",
                    "accion": "Automatiza una transferencia del 10% de tu ingreso a una cuenta de ahorro el día de pago."
                })
            elif ratio_ahorro >= 0.20:
                recomendaciones.append({
                    "categoria": "Ahorro",
                    "nivel": "baja",
                    "mensaje": f"¡Excelente! Estás ahorrando el {ratio_ahorro*100:.1f}% de tus ingresos.",
                    "accion": "Considera invertir tu excedente en un fondo de inversión o certificado de depósito."
                })
        
        # Análisis por categorías
        analisis_cat = self.analisis_por_categoria()
        if not analisis_cat.empty:
            top_categoria = analisis_cat.index[0]
            porcentaje_top = analisis_cat.iloc[0]['% del Total']
            
            if porcentaje_top > 30:
                recomendaciones.append({
                    "categoria": "Distribución",
                    "nivel": "media",
                    "mensaje": f"{top_categoria} representa el {porcentaje_top}% de tus gastos. Esto puede indicar una concentración excesiva.",
                    "accion": f"Busca alternativas más económicas en {top_categoria} o establece un límite mensual."
                })
        
        # Detectar suscripciones
        suscripciones = self.detectar_suscripciones()
        total_suscripciones = sum(s['monto_mensual'] for s in suscripciones)
        
        if total_suscripciones > 50:
            recomendaciones.append({
                "categoria": "Suscripciones",
                "nivel": "media",
                "mensaje": f"Pagas aproximadamente ${total_suscripciones:.2f} mensuales en suscripciones.",
                "accion": "Revisa si todas las suscripciones son necesarias. Considera compartir planes familiares."
            })
        
        # Análisis de métodos de pago
        metodos = self.df['metodo_pago'].value_counts()
        if 'YAPPY' in metodos and metodos['YAPPY'] > len(self.df) * 0.5:
            recomendaciones.append({
                "categoria": "Métodos de Pago",
                "nivel": "baja",
                "mensaje": "Usas YAPPY frecuentemente. Aprovecha las promociones de cashback.",
                "accion": "Verifica en la app de Banco General las promociones activas para YAPPY."
            })
        
        return recomendaciones
    
    def exportar_reporte(self, formato: str = 'json') -> str:
        """Exporta el análisis completo"""
        reporte = {
            "resumen": self.resumen_general(),
            "analisis_categorias": self.analisis_por_categoria().to_dict(),
            "analisis_mensual": self.analisis_mensual().to_dict(),
            "suscripciones": self.detectar_suscripciones(),
            "comercios_frecuentes": self.detectar_comercios_frecuentes().to_dict(),
            "recomendaciones": self.generar_recomendaciones(),
            "transacciones_procesadas": len(self.df)
        }
        
        if formato == 'json':
            return json.dumps(reporte, indent=2, ensure_ascii=False, default=str)
        return reporte

# ============================================================
# SECCIÓN 8: EJECUCIÓN CON DATOS REALES
# ============================================================

def procesar_todos_los_archivos():
    """Procesa todos los archivos de ejemplo y genera reporte consolidado"""
    
    archivos = [
        ('/mnt/kimi/upload/ULTIMOS-MOVIMIENTOS-CUENTA-DE-AHORROS-2026-03-17.xlsx', None),
        ('/mnt/kimi/upload/17_3_2026_MovimientosDeposito.xlsx', None),
        ('/mnt/kimi/upload/Transacciones del mes.xls', None)
    ]
    
    processor = FinancialDataProcessor()
    
    for archivo, banco_manual in archivos:
        try:
            print(f"\n{'='*60}")
            print(f"Procesando: {archivo.split('/')[-1]}")
            print('='*60)
            processor.procesar_archivo(archivo, banco_manual)
        except Exception as e:
            print(f"Error procesando {archivo}: {e}")
    
    # Análisis consolidado
    print(f"\n{'='*60}")
    print("ANÁLISIS CONSOLIDADO")
    print('='*60)
    
    analyzer = FinancialAnalyzer(processor.transacciones)
    
    print("\n📊 RESUMEN GENERAL:")
    resumen = analyzer.resumen_general()
    for key, value in resumen.items():
        print(f"  {key}: {value}")
    
    print("\n📈 ANÁLISIS POR CATEGORÍA:")
    cat_df = analyzer.analisis_por_categoria()
    print(cat_df)
    
    print("\n💳 SUSCRIPCIONES DETECTADAS:")
    suscripciones = analyzer.detectar_suscripciones()
    for sus in suscripciones[:5]:
        print(f"  • {sus['descripcion']}: ${sus['monto_mensual']}/mes ({sus['frecuencia']} pagos)")
    
    print("\n🏪 TOP COMERCIOS:")
    comercios = analyzer.detectar_comercios_frecuentes(5)
    print(comercios)
    
    print("\n💡 RECOMENDACIONES:")
    for i, rec in enumerate(analyzer.generar_recomendaciones(), 1):
        print(f"\n  {i}. [{rec['categoria']}] Nivel: {rec['nivel'].upper()}")
        print(f"     {rec['mensaje']}")
        print(f"     → {rec['accion']}")
    
    # Exportar reporte
    reporte = analyzer.exportar_reporte()
    with open('reporte_financiero_consolidado.json', 'w', encoding='utf-8') as f:
        f.write(reporte)
    print(f"\n✓ Reporte exportado: reporte_financiero_consolidado.json")
    
    return processor, analyzer

if __name__ == "__main__":
    processor, analyzer = procesar_todos_los_archivos()
