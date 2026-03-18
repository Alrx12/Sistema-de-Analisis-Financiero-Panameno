import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Callable
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
    OTROS = "Otros"

@dataclass
class Transaccion:
    fecha: datetime
    descripcion: str
    monto: float
    tipo: TipoTransaccion
    categoria: CategoriaGasto
    banco_origen: str
    raw_data: Dict  # Datos originales para referencia
    
    def to_dict(self):
        return {
            'fecha': self.fecha.strftime('%Y-%m-%d'),
            'descripcion': self.descripcion,
            'monto': self.monto,
            'tipo': self.tipo.value,
            'categoria': self.categoria.value,
            'banco_origen': self.banco_origen
        }

# ============================================================
# SECCIÓN 2: CLASE ABSTRACTA PARA PARSERS DE BANCOS
# ============================================================

class BankParser(ABC):
    """Clase base abstracta para todos los parsers bancarios"""
    
    def __init__(self, nombre_banco: str):
        self.nombre_banco = nombre_banco
        self.columnas_esperadas = self._definir_columnas()
        self.patrones_categoria = self._definir_patrones_categoria()
    
    @abstractmethod
    def _definir_columnas(self) -> Dict[str, str]:
        """Define el mapeo de columnas del archivo al formato estándar"""
        pass
    
    @abstractmethod
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        """Define palabras clave para categorización automática"""
        pass
    
    @abstractmethod
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si el DataFrame corresponde a este banco"""
        pass
    
    @abstractmethod
    def limpiar_monto(self, valor) -> float:
        """Limpia y convierte el monto a float"""
        pass
    
    def parsear_fecha(self, fecha_str) -> datetime:
        """Parsea fechas en varios formatos comunes"""
        formatos = ['%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d', '%d-%m-%Y', 
                   '%d/%m/%y', '%m/%d/%y', '%Y%m%d']
        
        if isinstance(fecha_str, datetime):
            return fecha_str
            
        for fmt in formatos:
            try:
                return datetime.strptime(str(fecha_str), fmt)
            except:
                continue
        raise ValueError(f"No se pudo parsear la fecha: {fecha_str}")
    
    def categorizar(self, descripcion: str, monto: float) -> CategoriaGasto:
        """Categoriza la transacción basado en la descripción"""
        desc_lower = descripcion.lower()
        
        # Detectar transferencias entre cuentas propias
        if any(word in desc_lower for word in ['transferencia', 'trf', 'traspaso']):
            if 'mismo banco' in desc_lower or 'cuenta propia' in desc_lower:
                return CategoriaGasto.TRANSFERENCIAS
        
        # Detectar ingresos (montos positivos grandes o palabras clave)
        if monto > 0 and any(word in desc_lower for word in ['deposito', 'abono', 'nomina', 'salario', 'transferencia recibida']):
            return CategoriaGasto.INGRESOS
        
        for categoria, palabras in self.patrones_categoria.items():
            if any(palabra in desc_lower for palabra in palabras):
                return categoria
        
        return CategoriaGasto.OTROS
    
    def determinar_tipo(self, monto: float, descripcion: str) -> TipoTransaccion:
        """Determina si es ingreso, egreso, etc."""
        if monto > 0:
            if any(word in descripcion.lower() for word in ['interes', 'interés']):
                return TipoTransaccion.INTERES
            return TipoTransaccion.INGRESO
        elif monto < 0:
            if any(word in descripcion.lower() for word in ['comision', 'comisión']):
                return TipoTransaccion.COMISION
            return TipoTransaccion.EGRESO
        return TipoTransaccion.DESCONOCIDO
    
    def procesar(self, df: pd.DataFrame) -> List[Transaccion]:
        """Procesa el DataFrame y retorna lista de transacciones estandarizadas"""
        transacciones = []
        
        # Renombrar columnas al formato estándar
        df_renombrado = df.rename(columns=self.columnas_esperadas)
        
        for _, row in df_renombrado.iterrows():
            try:
                # Limpiar y estandarizar datos
                fecha = self.parsear_fecha(row['fecha'])
                descripcion = str(row['descripcion']).strip()
                monto = self.limpiar_monto(row['monto'])
                
                # Determinar tipo y categoría
                tipo = self.determinar_tipo(monto, descripcion)
                categoria = self.categorizar(descripcion, monto)
                
                transaccion = Transaccion(
                    fecha=fecha,
                    descripcion=descripcion,
                    monto=monto,
                    tipo=tipo,
                    categoria=categoria,
                    banco_origen=self.nombre_banco,
                    raw_data=row.to_dict()
                )
                transacciones.append(transaccion)
                
            except Exception as e:
                print(f"Error procesando fila: {e}")
                continue
                
        return transacciones

# ============================================================
# SECCIÓN 3: IMPLEMENTACIONES ESPECÍFICAS POR BANCO
# ============================================================

class BancoGeneralParser(BankParser):
    """Parser para Banco General (Panamá)"""
    
    def __init__(self):
        super().__init__("Banco General")
    
    def _definir_columnas(self) -> Dict[str, str]:
        # Mapeo de columnas comunes en estados de cuenta de Banco General
        return {
            'Fecha': 'fecha',
            'Fecha Transacción': 'fecha',
            'Descripción': 'descripcion',
            'Descripcion': 'descripcion',
            'Concepto': 'descripcion',
            'Monto': 'monto',
            'Monto USD': 'monto',
            'Debito': 'monto',
            'Crédito': 'monto',
            'Balance': 'balance',
            'Saldo': 'balance'
        }
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: ['supermercado', 'super 99', 'rey', 'romero', 'el machetazo', 'restaurante', 'food', 'mcdonalds', 'kfc', 'pizza'],
            CategoriaGasto.TRANSPORTE: ['uber', 'didi', 'cabify', 'gasolina', 'combustible', 'taller', 'peaje', 'corporacion premio'],
            CategoriaGasto.SERVICIOS: ['idaan', 'ensa', 'cableonda', 'masmovil', 'claro', 'movistar', 'tigo', 'agua', 'luz', 'internet', 'telefono'],
            CategoriaGasto.ENTRETENIMIENTO: ['netflix', 'spotify', 'youtube', 'cinepolis', 'cinemark', 'steam', 'playstation', 'xbox'],
            CategoriaGasto.SALUD: ['farmacia', 'hospital', 'clinica', 'medico', 'laboratorio', 'metroplus', 'seguro social'],
            CategoriaGasto.EDUCACION: ['universidad', 'colegio', 'escuela', 'curso', 'udemy', 'coursera', 'libros'],
            CategoriaGasto.COMPRAS: ['amazon', 'ebay', 'aliexpress', 'shein', 'zara', 'hm', 'albrook', 'multiplaza', 'soho'],
            CategoriaGasto.VIAJES: ['aeropuerto', 'copa', 'airbnb', 'booking', 'hotel', 'tiquete', 'vuelo']
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si es Banco General por columnas específicas"""
        columnas = [col.lower() for col in df.columns]
        indicadores = ['banco general', 'bg', 'general']
        
        # Verificar si hay columnas típicas de BG
        columnas_bg = ['fecha', 'descripción', 'monto', 'balance']
        coincidencias = sum(1 for col in columnas if any(bg_col in col for bg_col in columnas_bg))
        return coincidencias >= 3
    
    def limpiar_monto(self, valor) -> float:
        """Limpia montos en formato panameño (separadores de miles y decimales)"""
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        # Limpiar string: quitar $, espacios, y manejar separadores
        monto_str = str(valor).replace('$', '').replace(' ', '').strip()
        
        # Detectar si usa coma como separador decimal o de miles
        if ',' in monto_str and '.' in monto_str:
            # Formato 1,234.56 (miles con coma, decimales con punto)
            if monto_str.rfind(',') < monto_str.rfind('.'):
                monto_str = monto_str.replace(',', '')
            else:
                # Formato 1.234,56 (miles con punto, decimales con coma - europeo)
                monto_str = monto_str.replace('.', '').replace(',', '.')
        elif ',' in monto_str:
            # Solo comas - verificar si es decimal o separador de miles
            partes = monto_str.split(',')
            if len(partes[-1]) == 2:  # Probablemente decimal
                monto_str = monto_str.replace(',', '.')
            else:
                monto_str = monto_str.replace(',', '')
        
        try:
            return float(monto_str)
        except:
            return 0.0

class BACParser(BankParser):
    """Parser para BAC Credomatic (Panamá)"""
    
    def __init__(self):
        super().__init__("BAC Credomatic")
    
    def _definir_columnas(self) -> Dict[str, str]:
        return {
            'FECHA': 'fecha',
            'FECHA DE TRANSACCION': 'fecha',
            'DESCRIPCION': 'descripcion',
            'DESCRIPCIÓN': 'descripcion',
            'DETALLE': 'descripcion',
            'MONTO': 'monto',
            'CARGO': 'monto',
            'ABONO': 'monto',
            'SALDO': 'balance'
        }
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: ['supermercado', 'rey', 'romero', 'el machetazo', 'rappy', 'pedidosya', 'food', 'restaurante'],
            CategoriaGasto.TRANSPORTE: ['uber', 'didi', 'gasolina', 'shell', 'texaco', 'delta', 'puma'],
            CategoriaGasto.SERVICIOS: ['idaan', 'ensa', 'cableonda', 'masmovil', 'claro', 'movistar', 'tigo'],
            CategoriaGasto.ENTRETENIMIENTO: ['netflix', 'spotify', 'prime video', 'disney', 'hbo', 'cine'],
            CategoriaGasto.SALUD: ['farmacia', 'hospital', 'clinica', 'metroplus', 'seguro'],
            CategoriaGasto.EDUCACION: ['universidad', 'colegio', 'curso', 'educacion'],
            CategoriaGasto.COMPRAS: ['amazon', 'ebay', 'albrook', 'multiplaza', 'westland'],
            CategoriaGasto.VIAJES: ['copa', 'booking', 'airbnb', 'expedia', 'hotel']
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        columnas = [col.upper() for col in df.columns]
        return any('BAC' in col or 'CREDOMATIC' in col for col in columnas) or \
               all(col in columnas for col in ['FECHA', 'DESCRIPCION', 'MONTO'])
    
    def limpiar_monto(self, valor) -> float:
        """BAC usualmente usa formato estándar o con paréntesis para negativos"""
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        monto_str = str(valor).replace('$', '').replace(' ', '').strip()
        
        # BAC a veces usa (100.00) para negativos
        if '(' in monto_str and ')' in monto_str:
            monto_str = monto_str.replace('(', '-').replace(')', '')
        
        # Manejar separadores
        if ',' in monto_str and '.' in monto_str:
            if monto_str.rfind(',') < monto_str.rfind('.'):
                monto_str = monto_str.replace(',', '')
            else:
                monto_str = monto_str.replace('.', '').replace(',', '.')
        elif ',' in monto_str:
            partes = monto_str.split(',')
            if len(partes[-1]) == 2:
                monto_str = monto_str.replace(',', '.')
            else:
                monto_str = monto_str.replace(',', '')
        
        try:
            return float(monto_str)
        except:
            return 0.0

class BanistmoParser(BankParser):
    """Parser para Banistmo (Panamá)"""
    
    def __init__(self):
        super().__init__("Banistmo")
    
    def _definir_columnas(self) -> Dict[str, str]:
        return {
            'Fecha': 'fecha',
            'Fecha Transacción': 'fecha',
            'Descripción': 'descripcion',
            'Referencia': 'descripcion',
            'Monto': 'monto',
            'Débito': 'monto',
            'Crédito': 'monto',
            'Saldo': 'balance'
        }
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: ['supermercado', 'rey', 'romero', 'machetazo', 'rappy', 'pedidosya', 'food'],
            CategoriaGasto.TRANSPORTE: ['uber', 'didi', 'gasolina', 'estacion de servicio', 'peaje'],
            CategoriaGasto.SERVICIOS: ['idaan', 'ensa', 'cableonda', 'claro', 'movistar', 'tigo', 'agua', 'luz'],
            CategoriaGasto.ENTRETENIMIENTO: ['netflix', 'spotify', 'cine', 'evento'],
            CategoriaGasto.SALUD: ['farmacia', 'hospital', 'clinica', 'salud'],
            CategoriaGasto.EDUCACION: ['universidad', 'colegio', 'curso', 'educacion'],
            CategoriaGasto.COMPRAS: ['amazon', 'albrook', 'multiplaza', 'compra'],
            CategoriaGasto.VIAJES: ['copa', 'booking', 'hotel', 'viaje']
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        columnas = [col.lower() for col in df.columns]
        return any('banistmo' in col for col in columnas) or \
               ('fecha' in columnas and 'descripción' in columnas and 'monto' in columnas)
    
    def limpiar_monto(self, valor) -> float:
        # Implementación similar a Banco General
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        monto_str = str(valor).replace('USD', '').replace('$', '').replace(' ', '').strip()
        
        if ',' in monto_str and '.' in monto_str:
            if monto_str.rfind(',') < monto_str.rfind('.'):
                monto_str = monto_str.replace(',', '')
            else:
                monto_str = monto_str.replace('.', '').replace(',', '.')
        elif ',' in monto_str:
            partes = monto_str.split(',')
            if len(partes[-1]) == 2:
                monto_str = monto_str.replace(',', '.')
            else:
                monto_str = monto_str.replace(',', '')
        
        try:
            return float(monto_str)
        except:
            return 0.0

# ============================================================
# SECCIÓN 4: MOTOR DE PROCESAMIENTO PRINCIPAL
# ============================================================

class FinancialDataProcessor:
    """Motor principal de procesamiento de datos financieros"""
    
    def __init__(self):
        self.parsers: List[BankParser] = [
            BancoGeneralParser(),
            BACParser(),
            BanistmoParser()
        ]
        self.transacciones: List[Transaccion] = []
    
    def detectar_banco(self, df: pd.DataFrame) -> Optional[BankParser]:
        """Detecta automáticamente el banco basado en el formato"""
        for parser in self.parsers:
            if parser.detectar_formato(df):
                print(f"✓ Banco detectado: {parser.nombre_banco}")
                return parser
        
        # Si no se detecta, preguntar al usuario o usar heurísticas
        print("⚠ No se pudo detectar el banco automáticamente")
        return None
    
    def cargar_archivo(self, ruta_archivo: str, banco_manual: Optional[str] = None) -> pd.DataFrame:
        """Carga archivo Excel o CSV"""
        try:
            if ruta_archivo.endswith('.csv'):
                # Intentar diferentes encodings comunes en Latinoamérica
                encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
                for encoding in encodings:
                    try:
                        df = pd.read_csv(ruta_archivo, encoding=encoding)
                        print(f"✓ Archivo CSV cargado con encoding: {encoding}")
                        break
                    except UnicodeDecodeError:
                        continue
            else:
                df = pd.read_excel(ruta_archivo)
                print("✓ Archivo Excel cargado")
            
            return df
            
        except Exception as e:
            raise Exception(f"Error cargando archivo: {e}")
    
    def procesar_archivo(self, ruta_archivo: str, banco_manual: Optional[str] = None) -> List[Transaccion]:
        """Procesa un archivo completo"""
        # Cargar datos
        df = self.cargar_archivo(ruta_archivo, banco_manual)
        
        print(f"Columnas detectadas: {list(df.columns)}")
        print(f"Total de filas: {len(df)}")
        
        # Detectar banco
        parser = None
        if banco_manual:
            parser = next((p for p in self.parsers if p.nombre_banco.lower() == banco_manual.lower()), None)
        
        if not parser:
            parser = self.detectar_banco(df)
        
        if not parser:
            raise Exception("No se pudo identificar el banco. Por favor especifica manualmente.")
        
        # Procesar transacciones
        transacciones = parser.procesar(df)
        self.transacciones.extend(transacciones)
        
        print(f"✓ {len(transacciones)} transacciones procesadas exitosamente")
        return transacciones
    
    def obtener_dataframe(self) -> pd.DataFrame:
        """Convierte las transacciones a DataFrame para análisis"""
        if not self.transacciones:
            return pd.DataFrame()
        
        data = [t.to_dict() for t in self.transacciones]
        return pd.DataFrame(data)

# ============================================================
# SECCIÓN 5: MOTOR DE ANÁLISIS E INSIGHTS
# ============================================================

class FinancialAnalyzer:
    """Genera insights y análisis financiero"""
    
    def __init__(self, transacciones: List[Transaccion]):
        self.df = pd.DataFrame([t.to_dict() for t in transacciones])
        if not self.df.empty:
            self.df['fecha'] = pd.to_datetime(self.df['fecha'])
            self.df['monto_abs'] = self.df['monto'].abs()
    
    def resumen_general(self) -> Dict:
        """Genera resumen ejecutivo"""
        if self.df.empty:
            return {"error": "No hay datos para analizar"}
        
        ingresos = self.df[self.df['tipo'] == 'ingreso']['monto'].sum()
        egresos = self.df[self.df['monto'] < 0]['monto'].sum()
        
        return {
            "total_transacciones": len(self.df),
            "periodo": f"{self.df['fecha'].min().strftime('%d/%m/%Y')} - {self.df['fecha'].max().strftime('%d/%m/%Y')}",
            "ingresos_totales": round(ingresos, 2),
            "egresos_totales": round(abs(egresos), 2),
            "balance_neto": round(ingresos + egresos, 2),
            "ahorro_potencial": round(ingresos * 0.20, 2)  # Regla del 20%
        }
    
    def analisis_por_categoria(self) -> pd.DataFrame:
        """Análisis detallado por categoría"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        gastos['monto'] = gastos['monto'].abs()
        
        analisis = gastos.groupby('categoria').agg({
            'monto': ['sum', 'mean', 'count'],
            'fecha': ['min', 'max']
        }).round(2)
        
        analisis.columns = ['Total Gastado', 'Promedio por Transacción', 'Cantidad Transacciones', 'Primera Fecha', 'Última Fecha']
        analisis['% del Total'] = (analisis['Total Gastado'] / analisis['Total Gastado'].sum() * 100).round(2)
        
        return analisis.sort_values('Total Gastado', ascending=False)
    
    def detectar_patrones(self) -> Dict:
        """Detecta patrones de gasto y suscripciones"""
        if self.df.empty:
            return {}
        
        patrones = {
            "suscripciones_detectadas": [],
            "gastos_recurrentes": [],
            "alertas": []
        }
        
        # Detectar suscripciones (mismos montos mensuales)
        egresos = self.df[self.df['monto'] < 0].copy()
        egresos['monto_abs'] = egresos['monto'].abs()
        
        for descripcion in egresos['descripcion'].unique():
            trans_desc = egresos[egresos['descripcion'] == descripcion]
            if len(trans_desc) >= 2:
                # Verificar si los montos son similares (suscripción)
                montos = trans_desc['monto_abs'].values
                if np.std(montos) / np.mean(montos) < 0.1:  # Variación menor al 10%
                    patrones["suscripciones_detectadas"].append({
                        "descripcion": descripcion,
                        "monto_mensual": round(np.mean(montos), 2),
                        "frecuencia": len(trans_desc),
                        "total_anual_estimado": round(np.mean(montos) * 12, 2)
                    })
        
        # Detectar gastos inusuales (outliers)
        for categoria in self.df['categoria'].unique():
            cat_data = self.df[self.df['categoria'] == categoria]['monto_abs']
            if len(cat_data) > 3:
                q75 = cat_data.quantile(0.75)
                q25 = cat_data.quantile(0.25)
                iqr = q75 - q25
                outliers = cat_data[cat_data > (q75 + 1.5 * iqr)]
                if not outliers.empty:
                    patrones["alertas"].append({
                        "tipo": "gasto_inusual",
                        "categoria": categoria,
                        "monto": round(outliers.max(), 2),
                        "mensaje": f"Detectado gasto inusual en {categoria}"
                    })
        
        return patrones
    
    def generar_recomendaciones(self) -> List[Dict]:
        """Genera recomendaciones personalizadas basadas en el análisis"""
        recomendaciones = []
        resumen = self.resumen_general()
        
        # Análisis de ahorro
        ingresos = resumen['ingresos_totales']
        egresos = resumen['egresos_totales']
        ratio_ahorro = (ingresos - egresos) / ingresos if ingresos > 0 else 0
        
        if ratio_ahorro < 0.1:
            recomendaciones.append({
                "categoria": "Ahorro",
                "nivel": "alta",
                "mensaje": f"Estás ahorrando menos del 10% de tus ingresos ({ratio_ahorro*100:.1f}%). Intenta reducir gastos discrecionales.",
                "accion": "Establece una transferencia automática del 20% de tu ingreso a una cuenta de ahorro el día de pago."
            })
        elif ratio_ahorro >= 0.20:
            recomendaciones.append({
                "categoria": "Ahorro",
                "nivel": "baja",
                "mensaje": f"¡Excelente! Estás ahorrando el {ratio_ahorro*100:.1f}% de tus ingresos.",
                "accion": "Considera invertir tu excedente de ahorro en instrumentos de mayor rendimiento."
            })
        
        # Análisis por categorías
        analisis_cat = self.analisis_por_categoria()
        if not analisis_cat.empty:
            top_categoria = analisis_cat.index[0]
            porcentaje_top = analisis_cat.iloc[0]['% del Total']
            
            if porcentaje_top > 40:
                recomendaciones.append({
                    "categoria": "Distribución de Gastos",
                    "nivel": "media",
                    "mensaje": f"Tus gastos en {top_categoria} representan el {porcentaje_top}% del total. Considera diversificar o reducir esta categoría.",
                    "accion": f"Revisa tus gastos en {top_categoria} y busca alternativas más económicas."
                })
        
        # Detectar cargos financieros
        cargos_banco = self.df[self.df['descripcion'].str.contains('comision|interes|cargo', case=False, na=False)]
        if not cargos_banco.empty:
            total_cargos = cargos_banco['monto'].sum()
            recomendaciones.append({
                "categoria": "Eficiencia Bancaria",
                "nivel": "alta",
                "mensaje": f"Has pagado ${abs(total_cargos):.2f} en comisiones e intereses bancarios.",
                "accion": "Contacta a tu banco para negociar comisiones o considera cambiar a una cuenta sin costo."
            })
        
        return recomendaciones
    
    def exportar_reporte(self, formato: str = 'json') -> str:
        """Exporta el análisis completo"""
        reporte = {
            "resumen": self.resumen_general(),
            "analisis_categorias": self.analisis_por_categoria().to_dict(),
            "patrones": self.detectar_patrones(),
            "recomendaciones": self.generar_recomendaciones(),
            "transacciones_procesadas": len(self.df)
        }
        
        if formato == 'json':
            return json.dumps(reporte, indent=2, ensure_ascii=False, default=str)
        return reporte

# ============================================================
# SECCIÓN 6: EJEMPLO DE USO Y DEMO
# ============================================================

def demo():
    """Demostración del sistema con datos de ejemplo"""
    
    # Crear datos de ejemplo para Banco General
    datos_ejemplo = {
        'Fecha': ['15/01/2024', '16/01/2024', '17/01/2024', '18/01/2024', '20/01/2024', '25/01/2024'],
        'Descripción': [
            'DEPOSITO NOMINA',
            'SUPER 99 PANAMA',
            'UBER TRIP HELP.UBER.COM',
            'PAGO IDAAN 123456',
            'NETFLIX.COM 80012345',
            'TRANSFERENCIA TRF A CUENTA AHORRO'
        ],
        'Monto': [2500.00, -85.50, -12.75, -45.00, -15.99, -500.00]
    }
    
    df_ejemplo = pd.DataFrame(datos_ejemplo)
    
    # Guardar como CSV para demo
    df_ejemplo.to_csv('ejemplo_banco_general.csv', index=False)
    print("✓ Archivo de ejemplo creado: ejemplo_banco_general.csv")
    
    # Procesar
    processor = FinancialDataProcessor()
    
    try:
        transacciones = processor.procesar_archivo('ejemplo_banco_general.csv', banco_manual='Banco General')
        
        # Analizar
        analyzer = FinancialAnalyzer(transacciones)
        
        print("\n" + "="*60)
        print("RESUMEN FINANCIERO")
        print("="*60)
        resumen = analyzer.resumen_general()
        for key, value in resumen.items():
            print(f"{key}: {value}")
        
        print("\n" + "="*60)
        print("ANÁLISIS POR CATEGORÍA")
        print("="*60)
        print(analyzer.analisis_por_categoria())
        
        print("\n" + "="*60)
        print("PATRONES DETECTADOS")
        print("="*60)
        patrones = analyzer.detectar_patrones()
        print(json.dumps(patrones, indent=2, ensure_ascii=False))
        
        print("\n" + "="*60)
        print("RECOMENDACIONES PERSONALIZADAS")
        print("="*60)
        for rec in analyzer.generar_recomendaciones():
            print(f"\n📌 [{rec['categoria']}] Nivel: {rec['nivel'].upper()}")
            print(f"   {rec['mensaje']}")
            print(f"   💡 Acción: {rec['accion']}")
        
        # Exportar reporte completo
        reporte = analyzer.exportar_reporte()
        with open('reporte_financiero.json', 'w', encoding='utf-8') as f:
            f.write(reporte)
        print("\n✓ Reporte exportado: reporte_financiero.json")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    demo()