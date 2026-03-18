"""
SISTEMA DE PROCESAMIENTO DE DATOS BANCARIOS - PANAMÁ v2.3
Corrección: Parser de BAC para manejo robusto de columnas
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum
import re
import json
import os
import sys
from abc import ABC, abstractmethod
from pathlib import Path

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
    metodo_pago: str
    archivo_origen: str = ""
    raw_data: Dict = field(default_factory=dict)
    
    def to_dict(self):
        return {
            'fecha': self.fecha.strftime('%Y-%m-%d'),
            'descripcion': self.descripcion,
            'monto': self.monto,
            'tipo': self.tipo.value,
            'categoria': self.categoria.value,
            'banco_origen': self.banco_origen,
            'metodo_pago': self.metodo_pago,
            'archivo_origen': self.archivo_origen
        }

@dataclass
class ConfiguracionUsuario:
    """Configuración personalizada por usuario"""
    user_id: str
    nombre: str
    bancos_activos: Set[str] = field(default_factory=set)
    carpeta_datos: str = ""
    
    def __post_init__(self):
        if not self.carpeta_datos:
            self.carpeta_datos = os.path.join(os.getcwd(), "datos_bancarios", self.user_id)
        
        Path(self.carpeta_datos).mkdir(parents=True, exist_ok=True)
    
    def to_dict(self):
        return {
            'user_id': self.user_id,
            'nombre': self.nombre,
            'bancos_activos': list(self.bancos_activos),
            'carpeta_datos': self.carpeta_datos
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(
            user_id=data['user_id'],
            nombre=data['nombre'],
            bancos_activos=set(data.get('bancos_activos', [])),
            carpeta_datos=data.get('carpeta_datos', '')
        )

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
        pass
    
    @abstractmethod
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        pass
    
    @abstractmethod
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        pass
    
    def parsear_fecha(self, fecha_str) -> Optional[datetime]:
        if pd.isna(fecha_str):
            return None
            
        if isinstance(fecha_str, datetime):
            return fecha_str
        
        # Si es Timestamp de pandas
        if isinstance(fecha_str, pd.Timestamp):
            return fecha_str.to_pydatetime()
        
        formatos = [
            '%Y-%m-%d %H:%M:%S',
            '%d/%m/%Y',
            '%d %b. %Y',
            '%d-%b-%Y',
            '%Y-%m-%d',
            '%d/%m/%y',
            '%m/%d/%Y',  # Formato US a veces usado
        ]
        
        for fmt in formatos:
            try:
                return datetime.strptime(str(fecha_str).strip(), fmt)
            except:
                continue
        
        meses_es = {
            'ene.': '01', 'feb.': '02', 'mar.': '03', 'abr.': '04',
            'may.': '05', 'jun.': '06', 'jul.': '07', 'ago.': '08',
            'sep.': '09', 'oct.': '10', 'nov.': '11', 'dic.': '12',
            'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'ago': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
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
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        monto_str = str(valor).replace('$', '').replace(' ', '').strip()
        
        if '(' in monto_str and ')' in monto_str:
            monto_str = '-' + monto_str.replace('(', '').replace(')', '')
        
        if ',' in monto_str and '.' in monto_str:
            last_comma = monto_str.rfind(',')
            last_point = monto_str.rfind('.')
            
            if last_point > last_comma:
                monto_str = monto_str.replace(',', '')
            else:
                monto_str = monto_str.replace('.', '').replace(',', '.')
        elif ',' in monto_str:
            if len(monto_str.split(',')[-1]) == 2:
                monto_str = monto_str.replace(',', '.')
            else:
                monto_str = monto_str.replace(',', '')
        
        try:
            return float(monto_str)
        except:
            return 0.0
    
    def categorizar(self, descripcion: str, monto: float) -> Tuple[CategoriaGasto, TipoTransaccion]:
        desc_lower = descripcion.lower()
        
        suscripciones = ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 
                        'youtube premium', 'google one', 'microsoft', 'norton',
                        'adobe', 'canva']
        for sus in suscripciones:
            if sus in desc_lower:
                return CategoriaGasto.SUSCRIPCIONES, TipoTransaccion.SUSCRIPCION
        
        if any(word in desc_lower for word in ['transferencia', 'transf.', 'trf', 'cuentas propias', 
                                               'cuenta propia', 'de cc a ah', 'de ah a cc', 'mismo banco']):
            if 'terceros' not in desc_lower:
                return CategoriaGasto.TRANSFERENCIAS, TipoTransaccion.TRANSFERENCIA
        
        if monto > 0:
            if any(word in desc_lower for word in ['pago de planilla', 'salario', 'nomina', 'deposito', 
                                                   'abono', 'credito', 'yappy bg de', 'ach xpr']):
                return CategoriaGasto.INGRESOS, TipoTransaccion.INGRESO
        
        if any(word in desc_lower for word in ['comision', 'interes', 'seguro', 'pago debitado para tdc',
                                              'prestamo', 'cartera', 'itbms']):
            return CategoriaGasto.FINANCIERO, TipoTransaccion.COMISION
        
        for categoria, palabras in self.patrones_categoria.items():
            if any(palabra in desc_lower for palabra in palabras):
                tipo = TipoTransaccion.EGRESO if monto < 0 else TipoTransaccion.INGRESO
                return categoria, tipo
        
        tipo = TipoTransaccion.EGRESO if monto < 0 else TipoTransaccion.INGRESO
        return CategoriaGasto.OTROS, tipo
    
    def procesar(self, df: pd.DataFrame, nombre_archivo: str = "") -> List[Transaccion]:
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
                    archivo_origen=nombre_archivo,
                    raw_data=row.to_dict()
                )
                transacciones.append(transaccion)
                
            except Exception as e:
                print(f"Error procesando fila: {e}")
                continue
                
        return transacciones
    
    def _detectar_metodo_pago(self, descripcion: str) -> str:
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
# SECCIÓN 3: IMPLEMENTACIONES ESPECÍFICAS DE BANCOS
# ============================================================

class BancoGeneralParser(BankParser):
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
        texto_completo = df.to_string().lower()
        indicadores = ['banco general', 'yappy bg', 'ahorros i', 'bg a ', 'bg de ']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            datos = []
            for idx, row in df.iterrows():
                if idx < 8:
                    continue
                
                if len(row) < 7:
                    continue
                
                fecha = row[0]
                descripcion = row[4] if pd.notna(row[4]) else ""
                
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

class BanistmoParser(BankParser):
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
        texto_completo = df.to_string().lower()
        indicadores = ['banistmo', 'db pos compra', 'db ach xpress', 'db compra e-commerce']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            for idx, row in df.iterrows():
                if 'fecha' in str(row).lower() and 'detalle' in str(row).lower():
                    header_row = idx
                    break
            
            if header_row is None:
                header_row = 26
            
            datos = []
            for idx, row in df.iterrows():
                if idx <= header_row:
                    continue
                
                if len(row) < 5:
                    continue
                
                fecha = row[1]
                descripcion = row[2] if pd.notna(row[2]) else ""
                
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

class BACParser(BankParser):
    """Parser para BAC Credomatic (Panamá) - VERSIÓN CORREGIDA"""
    
    def __init__(self):
        super().__init__("BAC Credomatic")
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: [
                'compass', 'restaurante', 'cafe', 'kitchen', 'food', 'mcdonalds',
                'kfc', 'pizza', 'burger', 'coffee'
            ],
            CategoriaGasto.TRANSPORTE: [
                'uber', 'didi', 'cabify', 'transporte', 'gasolina', 'combustible', 
                'estacion', 'peaje', 'delta', 'texaco', 'shell'
            ],
            CategoriaGasto.SERVICIOS: [
                'seguro', 'proteccion', 'servicio', 'agua', 'luz', 'internet',
                'telefono', 'cable', 'movil'
            ],
            CategoriaGasto.ENTRETENIMIENTO: [
                'netflix', 'spotify', 'disney', 'cine', 'evento', 'youtube',
                'hbo', 'prime', 'apple', 'google'
            ],
            CategoriaGasto.SALUD: [
                'farmacia', 'hospital', 'clinica', 'medico', 'salud', 'metroplus'
            ],
            CategoriaGasto.EDUCACION: [
                'universidad', 'colegio', 'escuela', 'curso', 'educacion', 'udemy'
            ],
            CategoriaGasto.COMPRAS: [
                'tienda', 'compra', 'retail', 'compass', 'super', 'novey',
                'xtra', 'super 99', 'do it center'
            ],
            CategoriaGasto.VIAJES: [
                'aeropuerto', 'copa', 'hotel', 'viaje', 'booking', 'airbnb'
            ],
            CategoriaGasto.FINANCIERO: [
                'pago tarjeta', 'proteccion robo', 'valor de tarjeta', 'comision',
                'interes', 'itbms', 'seguro fraude'
            ]
        }
    
    def detectar_formato(self, df: pd.DataFrame) -> bool:
        """Detecta si es BAC Credomatic"""
        texto_completo = df.to_string().lower()
        indicadores = ['bac credomatic', 'detalle de movimientos del período', 'compass']
        return any(ind in texto_completo for ind in indicadores)
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extrae datos del formato específico de BAC.
        BAC típicamente tiene columnas: Fecha, Referencia, Oficina, Código, Descripción, Canal, Cheque, Débitos, Créditos
        """
        try:
            # Mostrar las primeras filas para debug
            print(f"  ℹ Analizando estructura de archivo BAC...")
            
            # Buscar la fila de encabezados de forma más robusta
            header_row = None
            columnas_indices = {}
            
            for idx in range(min(20, len(df))):  # Revisar primeras 20 filas
                row = df.iloc[idx]
                row_str = str(row).lower()
                
                # Buscar fila que contenga palabras clave de encabezado
                if any(keyword in row_str for keyword in ['débitos', 'debitos', 'créditos', 'creditos', 'descripción', 'descripcion']):
                    header_row = idx
                    
                    # Intentar mapear columnas
                    for col_idx, val in enumerate(row):
                        if pd.notna(val):
                            val_str = str(val).lower().strip()
                            if any(key in val_str for key in ['fecha', 'date']):
                                columnas_indices['fecha'] = col_idx
                            elif any(key in val_str for key in ['débitos', 'debitos']):
                                columnas_indices['debito'] = col_idx
                            elif any(key in val_str for key in ['créditos', 'creditos']):
                                columnas_indices['credito'] = col_idx
                            elif any(key in val_str for key in ['descripción', 'descripcion', 'concepto']):
                                columnas_indices['descripcion'] = col_idx
                            elif 'código' in val_str or 'codigo' in val_str:
                                columnas_indices['codigo'] = col_idx
                    
                    print(f"  ℹ Encabezado BAC encontrado en fila {idx}")
                    print(f"  ℹ Columnas mapeadas: {columnas_indices}")
                    break
            
            if header_row is None:
                # Fallback: asumir estructura estándar
                header_row = 12
                columnas_indices = {
                    'fecha': 0,
                    'codigo': 3,
                    'descripcion': 4,
                    'debito': 7,
                    'credito': 8
                }
                print(f"  ℹ Usando estructura estándar BAC, fila {header_row}")
            
            datos = []
            
            for idx in range(header_row + 1, len(df)):
                try:
                    row = df.iloc[idx]
                    
                    # Extraer valores según mapeo
                    fecha_idx = columnas_indices.get('fecha', 0)
                    desc_idx = columnas_indices.get('descripcion', 4)
                    codigo_idx = columnas_indices.get('codigo', 3)
                    debito_idx = columnas_indices.get('debito', 7)
                    credito_idx = columnas_indices.get('credito', 8)
                    
                    # Validar índices
                    if fecha_idx >= len(row) or desc_idx >= len(row):
                        continue
                    
                    fecha = row.iloc[fecha_idx] if hasattr(row, 'iloc') else row[fecha_idx]
                    descripcion = row.iloc[desc_idx] if hasattr(row, 'iloc') else row[desc_idx]
                    
                    # Obtener código si existe
                    codigo = ""
                    if codigo_idx < len(row):
                        codigo_val = row.iloc[codigo_idx] if hasattr(row, 'iloc') else row[codigo_idx]
                        if pd.notna(codigo_val):
                            codigo = str(codigo_val).strip()
                    
                    # Obtener débito y crédito
                    debito_val = row.iloc[debito_idx] if hasattr(row, 'iloc') and debito_idx < len(row) else (row[debito_idx] if debito_idx < len(row) else None)
                    credito_val = row.iloc[credito_idx] if hasattr(row, 'iloc') and credito_idx < len(row) else (row[credito_idx] if credito_idx < len(row) else None)
                    
                    # Limpiar y convertir montos
                    debito = self.limpiar_monto(debito_val) if pd.notna(debito_val) else 0
                    credito = self.limpiar_monto(credito_val) if pd.notna(credito_val) else 0
                    
                    # Determinar monto final
                    if debito > 0 and credito == 0:
                        monto = -abs(debito)
                    elif credito > 0 and debito == 0:
                        monto = abs(credito)
                    elif debito > 0 and credito > 0:
                        # Ambos tienen valor, usar el que no sea cero o el mayor
                        monto = -abs(debito) if debito > credito else abs(credito)
                    else:
                        continue
                    
                    # Validar datos mínimos
                    if pd.isna(fecha) or pd.isna(descripcion):
                        continue
                    
                    descripcion_str = str(descripcion).strip()
                    if not descripcion_str or descripcion_str.lower() in ['nan', 'none', '', 'descripción']:
                        continue
                    
                    # Limpiar descripción
                    if codigo and codigo != 'nan':
                        descripcion_final = f"{codigo}: {descripcion_str}"
                    else:
                        descripcion_final = descripcion_str
                    
                    datos.append({
                        'fecha': fecha,
                        'descripcion': descripcion_final,
                        'monto': monto
                    })
                    
                except Exception as e:
                    # Ignorar errores en filas individuales
                    continue
            
            df_result = pd.DataFrame(datos)
            print(f"  ✓ {len(df_result)} transacciones extraídas de BAC")
            return df_result
            
        except Exception as e:
            print(f"  ✗ Error extrayendo datos de BAC: {e}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()

# ============================================================
# SECCIÓN 4: GESTIÓN DE USUARIOS Y CONFIGURACIÓN
# ============================================================

class UserManager:
    """Gestiona configuraciones de usuarios y persistencia"""
    
    CONFIG_FILE = "usuarios_config.json"
    
    def __init__(self):
        self.usuarios: Dict[str, ConfiguracionUsuario] = {}
        self._cargar_configuracion()
    
    def _cargar_configuracion(self):
        """Carga configuraciones desde archivo JSON"""
        if os.path.exists(self.CONFIG_FILE):
            try:
                with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for user_id, user_data in data.items():
                        self.usuarios[user_id] = ConfiguracionUsuario.from_dict(user_data)
            except Exception as e:
                print(f"⚠ Error cargando configuración: {e}")
    
    def _guardar_configuracion(self):
        """Guarda configuraciones en archivo JSON"""
        try:
            data = {uid: user.to_dict() for uid, user in self.usuarios.items()}
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠ Error guardando configuración: {e}")
    
    def crear_usuario(self, user_id: str, nombre: str, bancos: List[str] = None) -> ConfiguracionUsuario:
        """Crea un nuevo usuario con configuración inicial"""
        if user_id in self.usuarios:
            print(f"Usuario {user_id} ya existe.")
            return self.usuarios[user_id]
        
        user = ConfiguracionUsuario(
            user_id=user_id,
            nombre=nombre,
            bancos_activos=set(bancos) if bancos else set()
        )
        self.usuarios[user_id] = user
        self._guardar_configuracion()
        
        print(f"✓ Usuario creado: {nombre} (ID: {user_id})")
        print(f"  Bancos activos: {', '.join(user.bancos_activos) if user.bancos_activos else 'Ninguno'}")
        print(f"  Carpeta de datos: {user.carpeta_datos}")
        return user
    
    def obtener_usuario(self, user_id: str) -> Optional[ConfiguracionUsuario]:
        """Obtiene configuración de un usuario"""
        return self.usuarios.get(user_id)
    
    def listar_usuarios(self) -> List[ConfiguracionUsuario]:
        """Lista todos los usuarios registrados"""
        return list(self.usuarios.values())
    
    def eliminar_usuario(self, user_id: str):
        """Elimina un usuario"""
        if user_id in self.usuarios:
            del self.usuarios[user_id]
            self._guardar_configuracion()
            print(f"✓ Usuario {user_id} eliminado")

# ============================================================
# SECCIÓN 5: MOTOR DE PROCESAMIENTO PRINCIPAL
# ============================================================

class FinancialDataProcessor:
    """Motor principal de procesamiento"""
    
    BANCOS_DISPONIBLES = {
        'Banco General': BancoGeneralParser,
        'Banistmo': BanistmoParser,
        'BAC Credomatic': BACParser
    }
    
    def __init__(self, user_manager: UserManager = None):
        self.parsers: Dict[str, BankParser] = {}
        self.transacciones: List[Transaccion] = []
        self.user_manager = user_manager or UserManager()
        self.usuario_actual: Optional[ConfiguracionUsuario] = None
    
    def inicializar_para_usuario(self, user_id: str) -> bool:
        """Inicializa el procesador para un usuario específico"""
        self.usuario_actual = self.user_manager.obtener_usuario(user_id)
        
        if not self.usuario_actual:
            print(f"⚠ Usuario {user_id} no encontrado.")
            return False
        
        self.parsers = {}
        for banco in self.usuario_actual.bancos_activos:
            if banco in self.BANCOS_DISPONIBLES:
                self.parsers[banco] = self.BANCOS_DISPONIBLES[banco]()
        
        print(f"✓ Procesador inicializado para: {self.usuario_actual.nombre}")
        print(f"  Bancos configurados: {list(self.parsers.keys())}")
        return True
    
    def detectar_banco(self, df: pd.DataFrame) -> Optional[BankParser]:
        """Detecta automáticamente el banco"""
        for nombre, parser in self.parsers.items():
            if parser.detectar_formato(df):
                print(f"✓ Banco detectado: {nombre}")
                return parser
        
        print("⚠ No se pudo detectar el banco automáticamente")
        return None
    
    def cargar_archivo(self, ruta_archivo: str) -> pd.DataFrame:
        """Carga archivo Excel o CSV"""
        try:
            if not os.path.exists(ruta_archivo):
                raise FileNotFoundError(f"Archivo no encontrado: {ruta_archivo}")
            
            extension = Path(ruta_archivo).suffix.lower()
            
            if extension == '.csv':
                encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
                for encoding in encodings:
                    try:
                        df = pd.read_csv(ruta_archivo, encoding=encoding, header=None)
                        print(f"✓ CSV cargado: {os.path.basename(ruta_archivo)}")
                        break
                    except UnicodeDecodeError:
                        continue
            elif extension in ['.xls', '.xlsx']:
                if extension == '.xls':
                    try:
                        import xlrd
                        df = pd.read_excel(ruta_archivo, header=None, engine='xlrd')
                    except ImportError:
                        print("⚠ ERROR: Se requiere 'xlrd' para archivos .xls")
                        print("   Instala con: pip install xlrd")
                        raise ImportError("xlrd no está instalado")
                else:
                    df = pd.read_excel(ruta_archivo, header=None, engine='openpyxl')
                print(f"✓ Excel cargado: {os.path.basename(ruta_archivo)}")
            else:
                raise ValueError(f"Formato no soportado: {extension}")
            
            return df
            
        except Exception as e:
            raise Exception(f"Error cargando archivo: {e}")
    
    def procesar_archivo(self, ruta_archivo: str, banco_manual: Optional[str] = None) -> List[Transaccion]:
        """Procesa un archivo individual"""
        if not self.usuario_actual:
            raise Exception("Procesador no inicializado.")
        
        df = self.cargar_archivo(ruta_archivo)
        
        parser = None
        if banco_manual:
            if banco_manual not in self.parsers:
                raise Exception(f"Banco {banco_manual} no está activo")
            parser = self.parsers[banco_manual]
        else:
            parser = self.detectar_banco(df)
        
        if not parser:
            bancos_disponibles = list(self.parsers.keys())
            raise Exception(f"No se pudo identificar el banco. Disponibles: {bancos_disponibles}")
        
        nombre_archivo = os.path.basename(ruta_archivo)
        transacciones = parser.procesar(df, nombre_archivo)
        self.transacciones.extend(transacciones)
        
        print(f"✓ {len(transacciones)} transacciones procesadas de {parser.nombre_banco}")
        return transacciones
    
    def obtener_dataframe(self) -> pd.DataFrame:
        """Convierte transacciones a DataFrame"""
        if not self.transacciones:
            return pd.DataFrame()
        
        data = [t.to_dict() for t in self.transacciones]
        return pd.DataFrame(data)
    
    def limpiar_transacciones(self):
        """Limpia transacciones cargadas"""
        self.transacciones = []
        print("✓ Transacciones limpiadas")

# ============================================================
# SECCIÓN 6: MOTOR DE ANÁLISIS
# ============================================================

class FinancialAnalyzer:
    """Genera insights y análisis financiero"""
    
    def __init__(self, transacciones: List[Transaccion], usuario: ConfiguracionUsuario = None):
        self.df = pd.DataFrame([t.to_dict() for t in transacciones])
        self.usuario = usuario
        self.transacciones = transacciones
        
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
        
        por_banco = self.df.groupby('banco_origen').agg({
            'monto': lambda x: abs(x[x < 0].sum())
        }).to_dict()['monto'] if not self.df.empty else {}
        
        return {
            "usuario": self.usuario.nombre if self.usuario else "No especificado",
            "total_transacciones": len(self.df),
            "periodo": f"{self.df['fecha'].min().strftime('%d/%m/%Y')} - {self.df['fecha'].max().strftime('%d/%m/%Y')}",
            "ingresos_totales": round(ingresos, 2),
            "egresos_totales": round(abs(egresos), 2),
            "balance_neto": round(ingresos + egresos, 2),
            "promedio_diario_gasto": round(abs(egresos) / ((self.df['fecha'].max() - self.df['fecha'].min()).days + 1), 2),
            "ahorro_potencial_20": round(ingresos * 0.20, 2),
            "gastos_por_banco": por_banco,
            "bancos_utilizados": list(self.df['banco_origen'].unique()) if not self.df.empty else []
        }
    
    def analisis_por_categoria(self) -> pd.DataFrame:
        """Análisis por categoría"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        gastos['monto'] = gastos['monto'].abs()
        
        analisis = gastos.groupby('categoria').agg({
            'monto': ['sum', 'mean', 'count'],
            'fecha': ['min', 'max']
        })
        
        analisis.columns = ['Total Gastado', 'Promedio', 'Cantidad', 'Primera Fecha', 'Última Fecha']
        analisis[['Total Gastado', 'Promedio', 'Cantidad']] = analisis[['Total Gastado', 'Promedio', 'Cantidad']].round(2)
        analisis['% del Total'] = (analisis['Total Gastado'] / analisis['Total Gastado'].sum() * 100).round(2)
        
        return analisis.sort_values('Total Gastado', ascending=False)
    
    def analisis_por_banco(self) -> pd.DataFrame:
        """Análisis por banco"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        gastos['monto'] = gastos['monto'].abs()
        
        por_banco = gastos.groupby('banco_origen').agg({
            'monto': ['sum', 'count', 'mean']
        })
        
        por_banco.columns = ['Total Gastado', 'Transacciones', 'Promedio']
        por_banco = por_banco.round(2)
        por_banco['% del Total'] = (por_banco['Total Gastado'] / por_banco['Total Gastado'].sum() * 100).round(2)
        
        return por_banco.sort_values('Total Gastado', ascending=False)
    
    def analisis_mensual(self) -> pd.DataFrame:
        """Análisis por mes"""
        if self.df.empty:
            return pd.DataFrame()
        
        mensual = self.df.groupby('mes').agg({
            'monto': lambda x: x[x > 0].sum(),
        }).rename(columns={'monto': 'Ingresos'})
        
        mensual['Egresos'] = self.df.groupby('mes')['monto'].apply(lambda x: abs(x[x < 0].sum()))
        mensual['Balance'] = mensual['Ingresos'] - mensual['Egresos']
        mensual['Transacciones'] = self.df.groupby('mes').size()
        mensual.index = mensual.index.astype(str)
        
        return mensual.round(2)
    
    def detectar_suscripciones(self) -> List[Dict]:
        """Detecta suscripciones"""
        if self.df.empty:
            return []
        
        suscripciones = []
        df_sus = self.df[self.df['categoria'] == 'Suscripciones']
        
        for descripcion in df_sus['descripcion'].unique():
            trans = df_sus[df_sus['descripcion'] == descripcion]
            if len(trans) >= 2:
                monto_promedio = trans['monto_abs'].mean()
                frecuencia = len(trans)
                
                suscripciones.append({
                    'descripcion': descripcion[:50],
                    'monto_mensual': round(monto_promedio, 2),
                    'frecuencia': frecuencia,
                    'total_ultimos_meses': round(trans['monto_abs'].sum(), 2),
                    'proximo_pago_estimado': (trans['fecha'].max() + pd.Timedelta(days=30)).strftime('%Y-%m-%d'),
                    'banco': trans.iloc[0]['banco_origen'] if not trans.empty else "Desconocido"
                })
        
        return sorted(suscripciones, key=lambda x: x['monto_mensual'], reverse=True)
    
    def detectar_comercios_frecuentes(self, top_n: int = 10) -> pd.DataFrame:
        """Detecta comercios frecuentes"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        
        def extraer_comercio(desc):
            desc = desc.lower()
            for prefijo in ['pago yappy bg a ', 'yappy bg a ', 'yappy bg de ', 
                           'db pos compra ', 'db compra ', 'ach xpress ']:
                if desc.startswith(prefijo):
                    desc = desc[len(prefijo):]
            return desc.split()[0] if desc else 'desconocido'
        
        gastos['comercio'] = gastos['descripcion'].apply(extraer_comercio)
        
        frecuentes = gastos.groupby('comercio').agg({
            'monto': ['sum', 'count', 'mean']
        })
        
        frecuentes.columns = ['Total', 'Visitas', 'Promedio']
        frecuentes = frecuentes.round(2)
        frecuentes['% del Total'] = (frecuentes['Total'] / frecuentes['Total'].sum() * 100).round(2)
        
        return frecuentes.sort_values('Total', ascending=False).head(top_n)
    
    def generar_recomendaciones(self) -> List[Dict]:
        """Genera recomendaciones"""
        recomendaciones = []
        resumen = self.resumen_general()
        
        ingresos = resumen['ingresos_totales']
        egresos = resumen['egresos_totales']
        
        if len(resumen.get('bancos_utilizados', [])) > 1:
            recomendaciones.append({
                "categoria": "Múltiples Bancos",
                "nivel": "baja",
                "mensaje": f"Estás utilizando {len(resumen['bancos_utilizados'])} bancos diferentes.",
                "accion": "Consolida tus finanzas revisando cuál banco ofrece mejores beneficios."
            })
        
        if ingresos > 0:
            ratio_ahorro = (ingresos - egresos) / ingresos
            
            if ratio_ahorro < 0:
                recomendaciones.append({
                    "categoria": "Alerta Crítica",
                    "nivel": "alta",
                    "mensaje": f"Estás gastando ${abs(resumen['balance_neto']):.2f} más de lo que ingresas.",
                    "accion": "Revisa todas tus suscripciones y gastos discrecionales."
                })
            elif ratio_ahorro < 0.1:
                recomendaciones.append({
                    "categoria": "Ahorro",
                    "nivel": "alta",
                    "mensaje": f"Estás ahorrando solo el {ratio_ahorro*100:.1f}% de tus ingresos.",
                    "accion": "Automatiza una transferencia del 10% de tu ingreso a una cuenta de ahorro."
                })
            elif ratio_ahorro >= 0.20:
                recomendaciones.append({
                    "categoria": "Ahorro",
                    "nivel": "baja",
                    "mensaje": f"¡Excelente! Estás ahorrando el {ratio_ahorro*100:.1f}% de tus ingresos.",
                    "accion": "Considera invertir tu excedente en un fondo de inversión."
                })
        
        analisis_cat = self.analisis_por_categoria()
        if not analisis_cat.empty:
            top_categoria = analisis_cat.index[0]
            porcentaje_top = analisis_cat.iloc[0]['% del Total']
            
            if porcentaje_top > 30:
                recomendaciones.append({
                    "categoria": "Distribución",
                    "nivel": "media",
                    "mensaje": f"{top_categoria} representa el {porcentaje_top}% de tus gastos.",
                    "accion": f"Busca alternativas más económicas en {top_categoria}."
                })
        
        suscripciones = self.detectar_suscripciones()
        total_suscripciones = sum(s['monto_mensual'] for s in suscripciones)
        
        if total_suscripciones > 50:
            recomendaciones.append({
                "categoria": "Suscripciones",
                "nivel": "media",
                "mensaje": f"Pagas aproximadamente ${total_suscripciones:.2f} mensuales en suscripciones.",
                "accion": "Revisa si todas las suscripciones son necesarias."
            })
        
        metodos = self.df['metodo_pago'].value_counts()
        if 'YAPPY' in metodos and metodos['YAPPY'] > len(self.df) * 0.5:
            recomendaciones.append({
                "categoria": "Métodos de Pago",
                "nivel": "baja",
                "mensaje": "Usas YAPPY frecuentemente. Aprovecha las promociones de cashback.",
                "accion": "Verifica en la app de Banco General las promociones activas."
            })
        
        return recomendaciones
    
    def exportar_reporte(self, formato: str = 'json', ruta_salida: str = None) -> str:
        """Exporta reporte"""
        reporte = {
            "usuario": self.usuario.to_dict() if self.usuario else None,
            "resumen": self.resumen_general(),
            "analisis_categorias": self.analisis_por_categoria().to_dict(),
            "analisis_por_banco": self.analisis_por_banco().to_dict(),
            "analisis_mensual": self.analisis_mensual().to_dict(),
            "suscripciones": self.detectar_suscripciones(),
            "comercios_frecuentes": self.detectar_comercios_frecuentes().to_dict(),
            "recomendaciones": self.generar_recomendaciones(),
            "transacciones_procesadas": len(self.df),
            "fecha_generacion": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        def convertir_a_serializable(obj):
            if isinstance(obj, dict):
                return {str(k): convertir_a_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convertir_a_serializable(i) for i in obj]
            elif isinstance(obj, (np.integer, np.floating)):
                return float(obj)
            elif pd.isna(obj):
                return None
            else:
                return obj
        
        reporte_limpio = convertir_a_serializable(reporte)
        json_str = json.dumps(reporte_limpio, indent=2, ensure_ascii=False, default=str)
        
        if ruta_salida:
            with open(ruta_salida, 'w', encoding='utf-8') as f:
                f.write(json_str)
            print(f"✓ Reporte exportado: {ruta_salida}")
        
        return json_str

# ============================================================
# SECCIÓN 7: INTERFAZ DE USUARIO
# ============================================================

def mostrar_menu_principal():
    print("\n" + "="*60)
    print("🏦 SISTEMA DE ANÁLISIS FINANCIERO MULTI-USUARIO v2.3")
    print("="*60)
    print("1. Iniciar sesión")
    print("2. Crear nuevo usuario")
    print("3. Listar usuarios")
    print("4. Salir")
    print("-"*60)

def seleccionar_bancos() -> List[str]:
    bancos_disponibles = ['Banco General', 'Banistmo', 'BAC Credomatic']
    bancos_seleccionados = []
    
    print("\n🏦 Selecciona los bancos (números separados por comas, ej: 1,2):")
    for i, banco in enumerate(bancos_disponibles, 1):
        print(f"  {i}. {banco}")
    
    seleccion = input("\nTu selección: ").strip()
    
    try:
        indices = [int(x.strip()) - 1 for x in seleccion.split(',')]
        for idx in indices:
            if 0 <= idx < len(bancos_disponibles):
                bancos_seleccionados.append(bancos_disponibles[idx])
    except:
        print("⚠ Selección inválida. Usando todos los bancos.")
        return bancos_disponibles
    
    return bancos_seleccionados if bancos_seleccionados else bancos_disponibles

def crear_nuevo_usuario(user_manager: UserManager) -> Optional[ConfiguracionUsuario]:
    print("\n" + "="*60)
    print("👤 CREAR NUEVO USUARIO")
    print("="*60)
    
    user_id = input("ID de usuario (ej: alexis_pineda): ").strip().lower()
    if not user_id:
        print("⚠ ID inválido")
        return None
    
    if user_id in user_manager.usuarios:
        print(f"⚠ El usuario '{user_id}' ya existe.")
        return None
    
    nombre = input("Tu nombre completo: ").strip()
    if not nombre:
        print("⚠ Nombre inválido")
        return None
    
    bancos = seleccionar_bancos()
    
    print(f"\n✓ Configuración:")
    print(f"  ID: {user_id}")
    print(f"  Nombre: {nombre}")
    print(f"  Bancos: {', '.join(bancos)}")
    
    confirmar = input("\n¿Confirmar? (s/n): ").strip().lower()
    if confirmar == 's':
        return user_manager.crear_usuario(user_id, nombre, bancos)
    else:
        print("Creación cancelada.")
        return None

def iniciar_sesion(user_manager: UserManager) -> Optional[ConfiguracionUsuario]:
    print("\n" + "="*60)
    print("🔑 INICIAR SESIÓN")
    print("="*60)
    
    if not user_manager.usuarios:
        print("⚠ No hay usuarios registrados.")
        return None
    
    print("\nUsuarios disponibles:")
    for i, (uid, user) in enumerate(user_manager.usuarios.items(), 1):
        print(f"  {i}. {user.nombre} ({uid})")
    
    user_id = input("\nIngresa tu ID: ").strip().lower()
    usuario = user_manager.obtener_usuario(user_id)
    
    if usuario:
        print(f"✓ Bienvenido, {usuario.nombre}!")
        return usuario
    else:
        print("⚠ Usuario no encontrado.")
        return None

def procesar_archivos_usuario(processor: FinancialDataProcessor, usuario: ConfiguracionUsuario):
    print("\n" + "="*60)
    print("📂 PROCESAR ARCHIVOS")
    print("="*60)
    print("1. Desde mi carpeta de datos")
    print("2. Desde rutas específicas")
    print("3. Volver")
    
    opcion = input("\nSelecciona: ").strip()
    
    archivos_procesados = []
    
    if opcion == "1":
        carpeta = usuario.carpeta_datos
        if not os.path.exists(carpeta):
            print(f"⚠ Carpeta no existe: {carpeta}")
            return
        
        archivos = list(Path(carpeta).glob('*.xlsx')) + \
                   list(Path(carpeta).glob('*.xls')) + \
                   list(Path(carpeta).glob('*.csv'))
        
        if not archivos:
            print(f"⚠ No hay archivos en {carpeta}")
            return
        
        print(f"\n📁 {len(archivos)} archivos encontrados")
        for arch in archivos:
            print(f"  • {arch.name}")
        
        if input("\n¿Procesar todos? (s/n): ").strip().lower() == 's':
            for archivo in archivos:
                try:
                    processor.procesar_archivo(str(archivo))
                    archivos_procesados.append(archivo.name)
                except Exception as e:
                    print(f"⚠ Error en {archivo.name}: {e}")
    
    elif opcion == "2":
        print("\nIngresa rutas (una por línea, vacío para terminar):")
        rutas = []
        while True:
            ruta = input("> ").strip()
            if not ruta:
                break
            if os.path.exists(ruta):
                rutas.append(ruta)
            else:
                print(f"  ⚠ No existe: {ruta}")
        
        for ruta in rutas:
            try:
                processor.procesar_archivo(ruta)
                archivos_procesados.append(os.path.basename(ruta))
            except Exception as e:
                print(f"⚠ Error: {e}")
    
    return archivos_procesados

def mostrar_resultados(analyzer: FinancialAnalyzer):
    print("\n" + "="*60)
    print("📊 RESULTADOS")
    print("="*60)
    
    resumen = analyzer.resumen_general()
    print("\n📈 RESUMEN:")
    for key, value in resumen.items():
        if key not in ['gastos_por_banco']:
            print(f"  {key}: {value}")
    
    print("\n🏦 POR BANCO:")
    for banco, monto in resumen.get('gastos_por_banco', {}).items():
        print(f"  • {banco}: ${monto:.2f}")
    
    print("\n📊 TOP CATEGORÍAS:")
    cat_df = analyzer.analisis_por_categoria().head(5)
    for categoria, row in cat_df.iterrows():
        print(f"  • {categoria}: ${row['Total Gastado']:.2f} ({row['% del Total']:.1f}%)")
    
    suscripciones = analyzer.detectar_suscripciones()
    if suscripciones:
        print("\n💳 SUSCRIPCIONES:")
        for sus in suscripciones[:3]:
            print(f"  • {sus['descripcion'][:40]}")
            print(f"    ${sus['monto_mensual']}/mes - {sus['banco']}")
    
    print("\n💡 RECOMENDACIONES:")
    for i, rec in enumerate(analyzer.generar_recomendaciones()[:3], 1):
        print(f"\n  {i}. [{rec['categoria']}] {rec['nivel'].upper()}")
        print(f"     {rec['mensaje'][:60]}...")

def menu_principal():
    user_manager = UserManager()
    processor = None
    usuario_actual = None
    
    while True:
        mostrar_menu_principal()
        opcion = input("Selecciona (1-4): ").strip()
        
        if opcion == "1":
            usuario = iniciar_sesion(user_manager)
            if usuario:
                usuario_actual = usuario
                processor = FinancialDataProcessor(user_manager)
                if processor.inicializar_para_usuario(usuario.user_id):
                    while True:
                        print("\n" + "="*60)
                        print(f"👤 {usuario.nombre}")
                        print("="*60)
                        print("1. Procesar archivos")
                        print("2. Ver análisis")
                        print("3. Exportar reporte")
                        print("4. Cerrar sesión")
                        
                        sub = input("\nSelecciona: ").strip()
                        
                        if sub == "1":
                            procesar_archivos_usuario(processor, usuario)
                        elif sub == "2":
                            if processor.transacciones:
                                analyzer = FinancialAnalyzer(processor.transacciones, usuario)
                                mostrar_resultados(analyzer)
                            else:
                                print("⚠ No hay transacciones.")
                        elif sub == "3":
                            if processor.transacciones:
                                analyzer = FinancialAnalyzer(processor.transacciones, usuario)
                                ruta = os.path.join(usuario.carpeta_datos, "reporte.json")
                                analyzer.exportar_reporte(ruta_salida=ruta)
                            else:
                                print("⚠ No hay datos.")
                        elif sub == "4":
                            print(f"👋 Hasta luego, {usuario.nombre}!")
                            break
        
        elif opcion == "2":
            nuevo = crear_nuevo_usuario(user_manager)
            if nuevo:
                print(f"\n✓ Creado: {nuevo.nombre}")
                print(f"  Inicia sesión con ID: {nuevo.user_id}")
        
        elif opcion == "3":
            usuarios = user_manager.listar_usuarios()
            if usuarios:
                print("\n📋 Usuarios:")
                for u in usuarios:
                    print(f"  • {u.nombre} ({u.user_id})")
            else:
                print("⚠ No hay usuarios.")
        
        elif opcion == "4":
            print("👋 ¡Hasta luego!")
            break

# ============================================================
# EJECUCIÓN
# ============================================================

if __name__ == "__main__":
    try:
        import pandas
        import numpy
        import openpyxl
    except ImportError as e:
        print("⚠ ERROR: Faltan dependencias.")
        print("Instala: pip install pandas numpy openpyxl xlrd")
        sys.exit(1)
    
    menu_principal()