"""
SISTEMA DE PROCESAMIENTO DE DATOS BANCARIOS - PANAMÁ v3.0
Mejoras: Gestión de cuentas por banco + Flujo de procesamiento limpio
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
import shutil
import hashlib
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
class CuentaBancaria:
    """Representa una cuenta específica de un banco"""
    cuenta_id: str  # ID único de la cuenta (ej: "bg_ahorros_alexis", "bg_corriente_alexis")
    nombre_cuenta: str  # Nombre descriptivo (ej: "Ahorros Banco General", "Corriente Banco General")
    banco: str  # Banco General, Banistmo, BAC Credomatic
    tipo_cuenta: str  # ahorros, corriente, tarjeta, etc.
    numero_cuenta: str = ""  # Últimos 4 dígitos o identificador
    
    def to_dict(self):
        return {
            'cuenta_id': self.cuenta_id,
            'nombre_cuenta': self.nombre_cuenta,
            'banco': self.banco,
            'tipo_cuenta': self.tipo_cuenta,
            'numero_cuenta': self.numero_cuenta
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)

@dataclass
class Transaccion:
    fecha: datetime
    descripcion: str
    monto: float
    tipo: TipoTransaccion
    categoria: CategoriaGasto
    banco_origen: str
    cuenta_id: str  # NUEVO: ID de la cuenta específica
    cuenta_nombre: str  # NUEVO: Nombre descriptivo de la cuenta
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
            'cuenta_id': self.cuenta_id,  # NUEVO
            'cuenta_nombre': self.cuenta_nombre,  # NUEVO
            'metodo_pago': self.metodo_pago,
            'archivo_origen': self.archivo_origen
        }

@dataclass
class ConfiguracionUsuario:
    """Configuración personalizada por usuario con múltiples cuentas"""
    user_id: str
    nombre: str
    cuentas: List[CuentaBancaria] = field(default_factory=list)  # NUEVO: Lista de cuentas
    carpeta_datos: str = ""
    carpeta_procesados: str = ""  # NUEVO: Carpeta para archivos ya procesados
    
    def __post_init__(self):
        if not self.carpeta_datos:
            self.carpeta_datos = os.path.join(os.getcwd(), "datos_bancarios", self.user_id)
        
        # NUEVO: Crear carpeta de procesados
        self.carpeta_procesados = os.path.join(self.carpeta_datos, "procesados")
        
        Path(self.carpeta_datos).mkdir(parents=True, exist_ok=True)
        Path(self.carpeta_procesados).mkdir(parents=True, exist_ok=True)
    
    def to_dict(self):
        return {
            'user_id': self.user_id,
            'nombre': self.nombre,
            'cuentas': [c.to_dict() for c in self.cuentas],  # NUEVO
            'carpeta_datos': self.carpeta_datos,
            'carpeta_procesados': self.carpeta_procesados  # NUEVO
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        cuentas = [CuentaBancaria.from_dict(c) for c in data.get('cuentas', [])]
        return cls(
            user_id=data['user_id'],
            nombre=data['nombre'],
            cuentas=cuentas,
            carpeta_datos=data.get('carpeta_datos', ''),
            carpeta_procesados=data.get('carpeta_procesados', '')
        )
    
    # NUEVO: Métodos helper para gestionar cuentas
    def obtener_cuentas_por_banco(self, banco: str) -> List[CuentaBancaria]:
        """Obtiene todas las cuentas de un banco específico"""
        return [c for c in self.cuentas if c.banco == banco]
    
    def agregar_cuenta(self, cuenta: CuentaBancaria):
        """Agrega una nueva cuenta"""
        self.cuentas.append(cuenta)
    
    def eliminar_cuenta(self, cuenta_id: str):
        """Elimina una cuenta por ID"""
        self.cuentas = [c for c in self.cuentas if c.cuenta_id != cuenta_id]

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
    
    @abstractmethod
    def detectar_cuenta(self, df: pd.DataFrame) -> Optional[Dict]:
        """
        NUEVO: Detecta información de la cuenta desde el archivo
        Retorna dict con: numero_cuenta, tipo_cuenta, nombre_cuenta
        """
        pass
    
    def parsear_fecha(self, fecha_str) -> Optional[datetime]:
        if pd.isna(fecha_str):
            return None
            
        if isinstance(fecha_str, datetime):
            return fecha_str
        
        if isinstance(fecha_str, pd.Timestamp):
            return fecha_str.to_pydatetime()
        
        formatos = [
            '%Y-%m-%d %H:%M:%S',
            '%d/%m/%Y',
            '%d %b. %Y',
            '%d-%b-%Y',
            '%Y-%m-%d',
            '%d/%m/%y',
            '%m/%d/%Y',
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
    
    def procesar(self, df: pd.DataFrame, cuenta: CuentaBancaria, nombre_archivo: str = "") -> List[Transaccion]:
        """
        MODIFICADO: Ahora recibe la cuenta específica
        """
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
                
                # MODIFICADO: Incluir información de cuenta
                transaccion = Transaccion(
                    fecha=fecha,
                    descripcion=descripcion,
                    monto=monto,
                    tipo=tipo,
                    categoria=categoria,
                    banco_origen=self.nombre_banco,
                    cuenta_id=cuenta.cuenta_id,  # NUEVO
                    cuenta_nombre=cuenta.nombre_cuenta,  # NUEVO
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
    
    def detectar_cuenta(self, df: pd.DataFrame) -> Optional[Dict]:
        """
        NUEVO: Detecta información de cuenta desde el archivo de Banco General
        """
        try:
            # Buscar en las primeras filas información de cuenta
            for idx in range(min(10, len(df))):
                row_str = str(df.iloc[idx]).lower()
                
                # Buscar tipo de cuenta
                tipo_cuenta = "desconocida"
                if 'ahorros' in row_str:
                    tipo_cuenta = "ahorros"
                elif 'corriente' in row_str or 'cheques' in row_str:
                    tipo_cuenta = "corriente"
                
                # Buscar número de cuenta (generalmente viene como "Cuenta: XXXX" o similar)
                numero_cuenta = ""
                match = re.search(r'cuenta[:\s]+(\d{4,})', row_str)
                if match:
                    numero_cuenta = match.group(1)[-4:]  # Últimos 4 dígitos
                
                if tipo_cuenta != "desconocida" or numero_cuenta:
                    return {
                        'tipo_cuenta': tipo_cuenta,
                        'numero_cuenta': numero_cuenta,
                        'nombre_cuenta': f"Cuenta de {tipo_cuenta.capitalize()} BG"
                    }
            
            return {
                'tipo_cuenta': 'ahorros',
                'numero_cuenta': '',
                'nombre_cuenta': 'Cuenta Banco General'
            }
        except:
            return None
    
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
    
    def detectar_cuenta(self, df: pd.DataFrame) -> Optional[Dict]:
        """NUEVO: Detecta información de cuenta de Banistmo"""
        try:
            for idx in range(min(10, len(df))):
                row_str = str(df.iloc[idx]).lower()
                
                tipo_cuenta = "desconocida"
                if 'ahorros' in row_str:
                    tipo_cuenta = "ahorros"
                elif 'corriente' in row_str:
                    tipo_cuenta = "corriente"
                
                # Buscar número de cuenta
                numero_cuenta = ""
                match = re.search(r'(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})', str(df.iloc[idx]))
                if match:
                    numero_cuenta = match.group(3)  # Últimos 4
                
                if tipo_cuenta != "desconocida" or numero_cuenta:
                    return {
                        'tipo_cuenta': tipo_cuenta,
                        'numero_cuenta': numero_cuenta,
                        'nombre_cuenta': f"Cuenta {tipo_cuenta.capitalize()} Banistmo"
                    }
            
            return {
                'tipo_cuenta': 'ahorros',
                'numero_cuenta': '',
                'nombre_cuenta': 'Cuenta Banistmo'
            }
        except:
            return None
    
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
    """Parser para BAC Credomatic (Panamá)"""
    
    def __init__(self):
        super().__init__("BAC Credomatic")
    
    def _definir_patrones_categoria(self) -> Dict[CategoriaGasto, List[str]]:
        return {
            CategoriaGasto.ALIMENTACION: [
                'compass', 'restaurante', 'cafe', 'kitchen', 'food', 'mcdonalds',
                'kfc', 'pizza', 'burger', 'coffee'
            ],
            CategoriaGasto.TRANSPORTE: [
                'uber', 'didi', 'gasolina', 'combustible', 'estacion', 'peaje',
                'delta', 'texaco', 'shell'
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
        texto_completo = df.to_string().lower()
        indicadores = ['bac credomatic', 'detalle de movimientos del período', 'compass']
        return any(ind in texto_completo for ind in indicadores)
    
    def detectar_cuenta(self, df: pd.DataFrame) -> Optional[Dict]:
        """NUEVO: Detecta información de cuenta de BAC"""
        try:
            for idx in range(min(15, len(df))):
                row_str = str(df.iloc[idx]).lower()
                
                # BAC usualmente indica si es tarjeta de crédito o débito
                tipo_cuenta = "desconocida"
                if 'crédito' in row_str or 'credito' in row_str or 'visa' in row_str or 'mastercard' in row_str:
                    tipo_cuenta = "tarjeta_credito"
                elif 'débito' in row_str or 'debito' in row_str:
                    tipo_cuenta = "debito"
                elif 'ahorros' in row_str:
                    tipo_cuenta = "ahorros"
                
                # Buscar número de tarjeta/cuenta (generalmente enmascarado ****1234)
                numero_cuenta = ""
                match = re.search(r'\*+(\d{4})', str(df.iloc[idx]))
                if match:
                    numero_cuenta = match.group(1)
                
                if tipo_cuenta != "desconocida":
                    nombre = f"Tarjeta Crédito BAC" if tipo_cuenta == "tarjeta_credito" else f"Cuenta {tipo_cuenta.capitalize()} BAC"
                    return {
                        'tipo_cuenta': tipo_cuenta,
                        'numero_cuenta': numero_cuenta,
                        'nombre_cuenta': nombre
                    }
            
            return {
                'tipo_cuenta': 'ahorros',
                'numero_cuenta': '',
                'nombre_cuenta': 'Cuenta BAC Credomatic'
            }
        except:
            return None
    
    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            columnas_indices = {}
            
            for idx in range(min(20, len(df))):
                row = df.iloc[idx]
                row_str = str(row).lower()
                
                if any(keyword in row_str for keyword in ['débitos', 'debitos', 'créditos', 'creditos', 'descripción', 'descripcion']):
                    header_row = idx
                    
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
                    
                    break
            
            if header_row is None:
                header_row = 12
                columnas_indices = {
                    'fecha': 0,
                    'codigo': 3,
                    'descripcion': 4,
                    'debito': 7,
                    'credito': 8
                }
            
            datos = []
            
            for idx in range(header_row + 1, len(df)):
                try:
                    row = df.iloc[idx]
                    
                    fecha_idx = columnas_indices.get('fecha', 0)
                    desc_idx = columnas_indices.get('descripcion', 4)
                    codigo_idx = columnas_indices.get('codigo', 3)
                    debito_idx = columnas_indices.get('debito', 7)
                    credito_idx = columnas_indices.get('credito', 8)
                    
                    if fecha_idx >= len(row) or desc_idx >= len(row):
                        continue
                    
                    fecha = row.iloc[fecha_idx] if hasattr(row, 'iloc') else row[fecha_idx]
                    descripcion = row.iloc[desc_idx] if hasattr(row, 'iloc') else row[desc_idx]
                    
                    codigo = ""
                    if codigo_idx < len(row):
                        codigo_val = row.iloc[codigo_idx] if hasattr(row, 'iloc') else row[codigo_idx]
                        if pd.notna(codigo_val):
                            codigo = str(codigo_val).strip()
                    
                    debito_val = row.iloc[debito_idx] if hasattr(row, 'iloc') and debito_idx < len(row) else (row[debito_idx] if debito_idx < len(row) else None)
                    credito_val = row.iloc[credito_idx] if hasattr(row, 'iloc') and credito_idx < len(row) else (row[credito_idx] if credito_idx < len(row) else None)
                    
                    debito = self.limpiar_monto(debito_val) if pd.notna(debito_val) else 0
                    credito = self.limpiar_monto(credito_val) if pd.notna(credito_val) else 0
                    
                    if debito > 0 and credito == 0:
                        monto = -abs(debito)
                    elif credito > 0 and debito == 0:
                        monto = abs(credito)
                    elif debito > 0 and credito > 0:
                        monto = -abs(debito) if debito > credito else abs(credito)
                    else:
                        continue
                    
                    if pd.isna(fecha) or pd.isna(descripcion):
                        continue
                    
                    descripcion_str = str(descripcion).strip()
                    if not descripcion_str or descripcion_str.lower() in ['nan', 'none', '', 'descripción']:
                        continue
                    
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
                    continue
            
            df_result = pd.DataFrame(datos)
            return df_result
            
        except Exception as e:
            print(f"Error extrayendo datos de BAC: {e}")
            return pd.DataFrame()

# ============================================================
# SECCIÓN 4: GESTIÓN DE USUARIOS Y CUENTAS
# ============================================================

class UserManager:
    """Gestiona configuraciones de usuarios y sus cuentas"""
    
    CONFIG_FILE = "usuarios_config.json"
    
    def __init__(self):
        self.usuarios: Dict[str, ConfiguracionUsuario] = {}
        self._cargar_configuracion()
    
    def _cargar_configuracion(self):
        if os.path.exists(self.CONFIG_FILE):
            try:
                with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for user_id, user_data in data.items():
                        self.usuarios[user_id] = ConfiguracionUsuario.from_dict(user_data)
            except Exception as e:
                print(f"⚠ Error cargando configuración: {e}")
    
    def _guardar_configuracion(self):
        try:
            data = {uid: user.to_dict() for uid, user in self.usuarios.items()}
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠ Error guardando configuración: {e}")
    
    def crear_usuario(self, user_id: str, nombre: str) -> ConfiguracionUsuario:
        """Crea usuario sin cuentas (se agregan después)"""
        if user_id in self.usuarios:
            print(f"Usuario {user_id} ya existe.")
            return self.usuarios[user_id]
        
        user = ConfiguracionUsuario(
            user_id=user_id,
            nombre=nombre,
            cuentas=[]
        )
        self.usuarios[user_id] = user
        self._guardar_configuracion()
        
        print(f"✓ Usuario creado: {nombre} (ID: {user_id})")
        return user
    
    def agregar_cuenta_a_usuario(self, user_id: str, cuenta: CuentaBancaria):
        """Agrega una cuenta a un usuario existente"""
        if user_id in self.usuarios:
            self.usuarios[user_id].agregar_cuenta(cuenta)
            self._guardar_configuracion()
            print(f"✓ Cuenta '{cuenta.nombre_cuenta}' agregada a {user_id}")
    
    def obtener_usuario(self, user_id: str) -> Optional[ConfiguracionUsuario]:
        return self.usuarios.get(user_id)
    
    def listar_usuarios(self) -> List[ConfiguracionUsuario]:
        return list(self.usuarios.values())

# ============================================================
# SECCIÓN 5: MOTOR DE PROCESAMIENTO CON GESTIÓN DE ARCHIVOS
# ============================================================

class FinancialDataProcessor:
    """Motor principal con gestión de archivos y cuentas"""
    
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
        self.archivos_procesados: List[Path] = []  # NUEVO: Tracking de archivos procesados
    
    def inicializar_para_usuario(self, user_id: str) -> bool:
        """Inicializa el procesador para un usuario específico"""
        self.usuario_actual = self.user_manager.obtener_usuario(user_id)
        
        if not self.usuario_actual:
            print(f"⚠ Usuario {user_id} no encontrado.")
            return False
        
        # Inicializar parsers para todos los bancos disponibles
        self.parsers = {}
        for banco_nombre, parser_class in self.BANCOS_DISPONIBLES.items():
            self.parsers[banco_nombre] = parser_class()
        
        print(f"✓ Procesador inicializado para: {self.usuario_actual.nombre}")
        print(f"  Cuentas configuradas: {len(self.usuario_actual.cuentas)}")
        for c in self.usuario_actual.cuentas:
            print(f"    • {c.nombre_cuenta} ({c.banco})")
        
        return True
    
    def limpiar_sesion(self):
        """NUEVO: Limpia transacciones y archivos procesados para nueva sesión"""
        self.transacciones = []
        self.archivos_procesados = []
        print("✓ Sesión limpiada. Listo para nuevo análisis.")

    def _normalizar_id(self, texto: str) -> str:
        texto = (texto or "").strip().lower().replace(" ", "_")
        texto = re.sub(r'[^a-z0-9_]+', '', texto)
        return texto or "general"

    def _generar_hash_archivo(self, ruta_archivo: str) -> str:
        """Genera un hash corto y estable basado en el contenido del archivo."""
        hasher = hashlib.sha1()
        with open(ruta_archivo, 'rb') as archivo:
            for bloque in iter(lambda: archivo.read(65536), b''):
                hasher.update(bloque)
        return hasher.hexdigest()[:12]

    def _detectar_cuenta_existente(self, cuentas: List[CuentaBancaria], info_detectada: Optional[Dict]) -> Optional[CuentaBancaria]:
        """Intenta reutilizar una cuenta existente usando lo detectado en el archivo."""
        if not cuentas or not info_detectada:
            return None

        numero_detectado = (info_detectada.get('numero_cuenta') or "").strip()
        if numero_detectado:
            coincidencias = [
                cuenta for cuenta in cuentas
                if (cuenta.numero_cuenta or "").strip() == numero_detectado
            ]
            if len(coincidencias) == 1:
                return coincidencias[0]

        tipo_detectado = (info_detectada.get('tipo_cuenta') or "").strip().lower()
        if tipo_detectado:
            coincidencias = [
                cuenta for cuenta in cuentas
                if (cuenta.tipo_cuenta or "").strip().lower() == tipo_detectado
            ]
            if len(coincidencias) == 1:
                return coincidencias[0]

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
                        break
                    except UnicodeDecodeError:
                        continue
            elif extension in ['.xls', '.xlsx']:
                if extension == '.xls':
                    try:
                        import xlrd
                        df = pd.read_excel(ruta_archivo, header=None, engine='xlrd')
                    except ImportError:
                        print("⚠ ERROR: Instala xlrd: pip install xlrd")
                        raise
                else:
                    df = pd.read_excel(ruta_archivo, header=None, engine='openpyxl')
            else:
                raise ValueError(f"Formato no soportado: {extension}")
            
            return df
            
        except Exception as e:
            raise Exception(f"Error cargando archivo: {e}")
    
    def detectar_banco_y_cuenta(self, df: pd.DataFrame, ruta_archivo: str) -> Tuple[Optional[BankParser], Optional[Dict]]:
        """
        NUEVO: Detecta banco y extrae información de cuenta del archivo
        """
        for nombre, parser in self.parsers.items():
            if parser.detectar_formato(df):
                print(f"✓ Banco detectado: {nombre}")
                # Detectar información de cuenta desde el archivo
                info_cuenta = parser.detectar_cuenta(df)
                return parser, info_cuenta
        
        return None, None
    
    def seleccionar_cuenta_para_archivo(self, banco: str, info_detectada: Optional[Dict], ruta_archivo: str) -> Optional[CuentaBancaria]:
        """
        NUEVO: Permite al usuario seleccionar o crear cuenta para el archivo
        """
        cuentas_disponibles = self.usuario_actual.obtener_cuentas_por_banco(banco)

        cuenta_detectada = self._detectar_cuenta_existente(cuentas_disponibles, info_detectada)
        if cuenta_detectada:
            print(f"\n✓ Cuenta detectada automáticamente: {cuenta_detectada.nombre_cuenta}")
            return cuenta_detectada
        
        print(f"\n📋 Cuentas de {banco} disponibles:")
        
        if cuentas_disponibles:
            for i, cuenta in enumerate(cuentas_disponibles, 1):
                referencia = f" | Ref: {cuenta.numero_cuenta}" if cuenta.numero_cuenta else ""
                print(f"  {i}. {cuenta.nombre_cuenta} ({cuenta.tipo_cuenta}){referencia}")
            print(f"  {len(cuentas_disponibles) + 1}. Crear nueva cuenta")
        else:
            print("  No hay cuentas configuradas.")
            print("  1. Crear nueva cuenta")
        
        seleccion = input("\nSelecciona cuenta (número): ").strip()
        
        try:
            idx = int(seleccion) - 1
            if cuentas_disponibles and 0 <= idx < len(cuentas_disponibles):
                return cuentas_disponibles[idx]
            elif idx == len(cuentas_disponibles) or not cuentas_disponibles:
                # Crear nueva cuenta
                print(f"\n🏦 Crear nueva cuenta de {banco}")
                
                # Sugerir nombre basado en detección automática
                nombre_sugerido = info_detectada['nombre_cuenta'] if info_detectada else f"Cuenta {banco}"
                nombre = input(f"Nombre de la cuenta [{nombre_sugerido}]: ").strip() or nombre_sugerido
                
                tipo_sugerido = info_detectada['tipo_cuenta'] if info_detectada else "ahorros"
                tipo = input(f"Tipo (ahorros/corriente/tarjeta) [{tipo_sugerido}]: ").strip() or tipo_sugerido

                numero = info_detectada.get('numero_cuenta', '') if info_detectada else ''
                if numero:
                    print(f"✓ Referencia detectada automáticamente: {numero}")

                archivo_hash = self._generar_hash_archivo(ruta_archivo)
                cuenta_id = (
                    f"{self._normalizar_id(self.usuario_actual.user_id)}_"
                    f"{self._normalizar_id(banco)}_"
                    f"{self._normalizar_id(tipo)}_"
                    f"{archivo_hash}"
                )

                cuenta_existente = next(
                    (cuenta for cuenta in self.usuario_actual.cuentas if cuenta.cuenta_id == cuenta_id),
                    None
                )
                if cuenta_existente:
                    print(f"✓ Reutilizando cuenta existente: {cuenta_existente.nombre_cuenta}")
                    return cuenta_existente
                
                nueva_cuenta = CuentaBancaria(
                    cuenta_id=cuenta_id,
                    nombre_cuenta=nombre,
                    banco=banco,
                    tipo_cuenta=tipo,
                    numero_cuenta=numero
                )
                
                self.user_manager.agregar_cuenta_a_usuario(self.usuario_actual.user_id, nueva_cuenta)
                return nueva_cuenta
            
        except (ValueError, IndexError):
            print("⚠ Selección inválida")
            return None
        
        return None
    
    def procesar_archivo(self, ruta_archivo: str, cuenta: CuentaBancaria = None, banco_manual: str = None) -> List[Transaccion]:
        """
        MODIFICADO: Procesa archivo asignándolo a una cuenta específica
        """
        if not self.usuario_actual:
            raise Exception("Procesador no inicializado.")
        
        df = self.cargar_archivo(ruta_archivo)
        
        # Detectar banco y cuenta
        parser, info_cuenta = self.detectar_banco_y_cuenta(df, ruta_archivo)
        
        if not parser:
            if banco_manual and banco_manual in self.parsers:
                parser = self.parsers[banco_manual]
                info_cuenta = parser.detectar_cuenta(df)
            else:
                raise Exception("No se pudo detectar el banco.")
        
        # Si no se proporcionó cuenta, pedir al usuario
        if not cuenta:
            cuenta = self.seleccionar_cuenta_para_archivo(parser.nombre_banco, info_cuenta, ruta_archivo)
            if not cuenta:
                raise Exception("No se seleccionó cuenta.")
        
        # Verificar que la cuenta pertenece al banco detectado
        if cuenta.banco != parser.nombre_banco:
            print(f"⚠ Advertencia: La cuenta {cuenta.nombre_cuenta} es de {cuenta.banco}, pero el archivo parece ser de {parser.nombre_banco}")
            confirmar = input("¿Continuar de todos modos? (s/n): ").strip().lower()
            if confirmar != 's':
                raise Exception("Procesamiento cancelado por el usuario.")
        
        # Procesar transacciones
        nombre_archivo = os.path.basename(ruta_archivo)
        transacciones = parser.procesar(df, cuenta, nombre_archivo)
        self.transacciones.extend(transacciones)
        
        # NUEVO: Guardar referencia al archivo para moverlo después
        self.archivos_procesados.append(Path(ruta_archivo))
        
        print(f"✓ {len(transacciones)} transacciones procesadas de {cuenta.nombre_cuenta}")
        return transacciones
    
    def mover_archivos_procesados(self):
        """
        NUEVO: Mueve archivos procesados a carpeta de procesados
        """
        if not self.archivos_procesados:
            return
        
        carpeta_destino = Path(self.usuario_actual.carpeta_procesados)
        carpeta_destino.mkdir(parents=True, exist_ok=True)
        
        # Crear subcarpeta con fecha/hora
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        subcarpeta = carpeta_destino / f"procesado_{timestamp}"
        subcarpeta.mkdir(exist_ok=True)
        
        movidos = 0
        for archivo in self.archivos_procesados:
            try:
                destino = subcarpeta / archivo.name
                # Si ya existe, agregar número
                counter = 1
                while destino.exists():
                    destino = subcarpeta / f"{archivo.stem}_{counter}{archivo.suffix}"
                    counter += 1
                
                shutil.move(str(archivo), str(destino))
                movidos += 1
                print(f"  📁 Movido: {archivo.name} → {destino.name}")
            except Exception as e:
                print(f"  ⚠ Error moviendo {archivo.name}: {e}")
        
        print(f"✓ {movidos} archivos movidos a {subcarpeta}")
        self.archivos_procesados = []  # Limpiar lista
    
    def obtener_dataframe(self) -> pd.DataFrame:
        if not self.transacciones:
            return pd.DataFrame()
        
        data = [t.to_dict() for t in self.transacciones]
        return pd.DataFrame(data)

# ============================================================
# SECCIÓN 6: MOTOR DE ANÁLISIS (ACTUALIZADO PARA CUENTAS)
# ============================================================

class FinancialAnalyzer:
    """Análisis financiero con soporte para múltiples cuentas"""
    
    def __init__(self, transacciones: List[Transaccion], usuario: ConfiguracionUsuario = None):
        self.df = pd.DataFrame([t.to_dict() for t in transacciones])
        self.usuario = usuario
        self.transacciones = transacciones
        
        if not self.df.empty:
            self.df['fecha'] = pd.to_datetime(self.df['fecha'])
            self.df['monto_abs'] = self.df['monto'].abs()
            self.df['mes'] = self.df['fecha'].dt.to_period('M')
    
    def resumen_general(self) -> Dict:
        if self.df.empty:
            return {"error": "No hay datos para analizar"}
        
        ingresos = self.df[self.df['monto'] > 0]['monto'].sum()
        egresos = self.df[self.df['monto'] < 0]['monto'].sum()
        
        # Por banco
        por_banco = self.df.groupby('banco_origen').agg({
            'monto': lambda x: abs(x[x < 0].sum())
        }).to_dict()['monto'] if not self.df.empty else {}
        
        # NUEVO: Por cuenta específica
        por_cuenta = self.df.groupby('cuenta_nombre').agg({
            'monto': ['sum', lambda x: abs(x[x < 0].sum()), 'count']
        }).round(2) if not self.df.empty else pd.DataFrame()
        
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
            "bancos_utilizados": list(self.df['banco_origen'].unique()) if not self.df.empty else [],
            "cuentas_utilizadas": list(self.df['cuenta_nombre'].unique()) if not self.df.empty else [],
            "total_cuentas": self.df['cuenta_id'].nunique() if not self.df.empty else 0
        }
    
    def analisis_por_cuenta(self) -> pd.DataFrame:
        """NUEVO: Análisis detallado por cuenta específica"""
        if self.df.empty:
            return pd.DataFrame()
        
        gastos = self.df[self.df['monto'] < 0].copy()
        gastos['monto'] = gastos['monto'].abs()
        
        por_cuenta = gastos.groupby(['banco_origen', 'cuenta_nombre']).agg({
            'monto': ['sum', 'mean', 'count']
        }).round(2)
        
        por_cuenta.columns = ['Total Gastado', 'Promedio', 'Transacciones']
        por_cuenta['% del Total'] = (por_cuenta['Total Gastado'] / por_cuenta['Total Gastado'].sum() * 100).round(2)
        
        return por_cuenta.sort_values('Total Gastado', ascending=False)
    
    def analisis_por_categoria(self) -> pd.DataFrame:
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
                    'banco': trans.iloc[0]['banco_origen'],
                    'cuenta': trans.iloc[0]['cuenta_nombre']  # NUEVO
                })
        
        return sorted(suscripciones, key=lambda x: x['monto_mensual'], reverse=True)
    
    def detectar_comercios_frecuentes(self, top_n: int = 10) -> pd.DataFrame:
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
        recomendaciones = []
        resumen = self.resumen_general()
        
        ingresos = resumen['ingresos_totales']
        egresos = resumen['egresos_totales']
        
        # NUEVO: Recomendación sobre múltiples cuentas
        if resumen.get('total_cuentas', 0) > 1:
            recomendaciones.append({
                "categoria": "Múltiples Cuentas",
                "nivel": "baja",
                "mensaje": f"Estás gestionando {resumen['total_cuentas']} cuentas bancarias.",
                "accion": "Revisa si puedes consolidar saldos entre cuentas del mismo banco para optimizar comisiones."
            })
        
        if len(resumen.get('bancos_utilizados', [])) > 1:
            recomendaciones.append({
                "categoria": "Múltiples Bancos",
                "nivel": "baja",
                "mensaje": f"Utilizas {len(resumen['bancos_utilizados'])} bancos diferentes.",
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
                "mensaje": "Usas YAPPY frecuentemente.",
                "accion": "Verifica en la app de Banco General las promociones de cashback."
            })
        
        return recomendaciones
    
    def exportar_reporte(self, formato: str = 'json', ruta_salida: str = None) -> str:
        reporte = {
            "usuario": self.usuario.to_dict() if self.usuario else None,
            "resumen": self.resumen_general(),
            "analisis_por_cuenta": self.analisis_por_cuenta().to_dict(),  # NUEVO
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
# SECCIÓN 7: INTERFAZ DE USUARIO INTERACTIVA (MEJORADA)
# ============================================================

def mostrar_menu_principal():
    print("\n" + "="*60)
    print("🏦 SISTEMA DE ANÁLISIS FINANCIERO MULTI-CUENTA v3.0")
    print("="*60)
    print("1. Iniciar sesión")
    print("2. Crear nuevo usuario")
    print("3. Listar usuarios")
    print("4. Salir")
    print("-"*60)

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
    
    print(f"\n✓ Usuario '{nombre}' creado.")
    print("  Las cuentas bancarias se configurarán al procesar archivos.")
    
    return user_manager.crear_usuario(user_id, nombre)

def iniciar_sesion(user_manager: UserManager) -> Optional[ConfiguracionUsuario]:
    print("\n" + "="*60)
    print("🔑 INICIAR SESIÓN")
    print("="*60)
    
    if not user_manager.usuarios:
        print("⚠ No hay usuarios registrados.")
        return None
    
    print("\nUsuarios disponibles:")
    for i, (uid, user) in enumerate(user_manager.usuarios.items(), 1):
        print(f"  {i}. {user.nombre} ({uid}) - {len(user.cuentas)} cuentas")
    
    user_id = input("\nIngresa tu ID: ").strip().lower()
    usuario = user_manager.obtener_usuario(user_id)
    
    if usuario:
        print(f"✓ Bienvenido, {usuario.nombre}!")
        return usuario
    else:
        print("⚠ Usuario no encontrado.")
        return None

def gestionar_procesamiento_archivos(processor: FinancialDataProcessor, usuario: ConfiguracionUsuario):
    """
    NUEVO: Flujo completo de procesamiento con gestión de archivos
    """
    print("\n" + "="*60)
    print("📂 PROCESAR ARCHIVOS BANCARIOS")
    print("="*60)
    
    # Paso 1: Limpiar sesión anterior
    processor.limpiar_sesion()
    
    # Paso 2: Preguntar fuente de archivos
    print("\n¿Qué deseas hacer?")
    print("1. Usar últimos archivos procesados (si están disponibles)")
    print("2. Agregar nuevos archivos")
    print("3. Volver al menú anterior")
    
    opcion = input("\nSelecciona (1-3): ").strip()
    
    archivos_a_procesar = []
    
    if opcion == "1":
        # Buscar archivos en carpeta de procesados recientes
        carpeta_procesados = Path(usuario.carpeta_procesados)
        if carpeta_procesados.exists():
            # Obtener la subcarpeta más reciente
            subcarpetas = sorted([d for d in carpeta_procesados.iterdir() if d.is_dir()], reverse=True)
            if subcarpetas:
                ultima = subcarpetas[0]
                archivos = list(ultima.glob('*.xlsx')) + list(ultima.glob('*.xls')) + list(ultima.glob('*.csv'))
                if archivos:
                    print(f"\n📁 {len(archivos)} archivos encontrados en procesados recientes:")
                    for a in archivos:
                        print(f"  • {a.name}")
                    
                    if input("\n¿Procesar estos archivos? (s/n): ").strip().lower() == 's':
                        archivos_a_procesar = [str(a) for a in archivos]
                    else:
                        return
                else:
                    print("⚠ No hay archivos en procesados recientes.")
                    return
            else:
                print("⚠ No hay historial de archivos procesados.")
                return
        else:
            print("⚠ No existe carpeta de procesados.")
            return
    
    elif opcion == "2":
        # Agregar nuevos archivos
        print("\nOpciones:")
        print("a) Desde mi carpeta de datos")
        print("b) Desde rutas específicas")
        
        sub_opcion = input("\nSelecciona (a/b): ").strip().lower()
        
        if sub_opcion == "a":
            carpeta = Path(usuario.carpeta_datos)
            if not carpeta.exists():
                print(f"⚠ Carpeta no existe: {carpeta}")
                return
            
            archivos = list(carpeta.glob('*.xlsx')) + list(carpeta.glob('*.xls')) + list(carpeta.glob('*.csv'))
            
            if not archivos:
                print(f"⚠ No hay archivos en {carpeta}")
                return
            
            print(f"\n📁 {len(archivos)} archivos encontrados:")
            for i, arch in enumerate(archivos, 1):
                print(f"  {i}. {arch.name}")
            
            seleccion = input("\nIngresa números a procesar (ej: 1,3,4) o 'todos': ").strip()
            
            if seleccion.lower() == 'todos':
                archivos_a_procesar = [str(a) for a in archivos]
            else:
                try:
                    indices = [int(x.strip()) - 1 for x in seleccion.split(',')]
                    archivos_a_procesar = [str(archivos[i]) for i in indices if 0 <= i < len(archivos)]
                except:
                    print("⚠ Selección inválida")
                    return
        
        elif sub_opcion == "b":
            print("\nIngresa rutas completas (una por línea, vacío para terminar):")
            print("Ejemplo: C:\\Users\\...\\archivo.xlsx")
            
            while True:
                ruta = input("> ").strip()
                if not ruta:
                    break
                if os.path.exists(ruta):
                    archivos_a_procesar.append(ruta)
                else:
                    print(f"  ⚠ No existe: {ruta}")
    
    else:
        return
    
    # Paso 3: Procesar archivos
    if not archivos_a_procesar:
        print("⚠ No hay archivos para procesar.")
        return
    
    print(f"\n🔄 Procesando {len(archivos_a_procesar)} archivos...")
    
    for ruta in archivos_a_procesar:
        try:
            print(f"\n{'='*50}")
            print(f"📄 {os.path.basename(ruta)}")
            print('='*50)
            processor.procesar_archivo(ruta)
        except Exception as e:
            print(f"⚠ Error procesando {ruta}: {e}")
    
    # Paso 4: Resumen y mover archivos
    if processor.transacciones:
        df_resumen = processor.obtener_dataframe()
        print(f"\n{'='*60}")
        print(f"✓ {len(processor.transacciones)} transacciones procesadas en total")
        print(f"  Cuentas involucradas: {df_resumen['cuenta_nombre'].nunique() if not df_resumen.empty else 0}")
        
        # Mover archivos procesados
        if opcion == "2":  # Solo mover si eran archivos nuevos
            print("\n📁 ¿Deseas mover los archivos procesados a la carpeta de históricos?")
            if input("(s/n): ").strip().lower() == 's':
                processor.mover_archivos_procesados()
    else:
        print("⚠ No se procesaron transacciones.")

def mostrar_menu_analisis(processor: FinancialDataProcessor, usuario: ConfiguracionUsuario):
    """Muestra resultados del análisis actual"""
    if not processor.transacciones:
        print("⚠ No hay transacciones procesadas.")
        return
    
    analyzer = FinancialAnalyzer(processor.transacciones, usuario)
    
    print("\n" + "="*60)
    print("📊 ANÁLISIS FINANCIERO")
    print("="*60)
    
    # Resumen
    resumen = analyzer.resumen_general()
    print(f"\n👤 {resumen['usuario']}")
    print(f"📅 Período: {resumen['periodo']}")
    print(f"💰 Ingresos: ${resumen['ingresos_totales']:,.2f}")
    print(f"💸 Egresos: ${resumen['egresos_totales']:,.2f}")
    print(f"📈 Balance: ${resumen['balance_neto']:,.2f}")
    
    # Por cuenta
    print(f"\n🏦 RESUMEN POR CUENTA:")
    por_cuenta = analyzer.analisis_por_cuenta()
    for (banco, cuenta), row in por_cuenta.iterrows():
        print(f"  • {cuenta}: ${row['Total Gastado']:,.2f} ({row['Transacciones']} trans)")
    
    # Por categoría
    print(f"\n📊 TOP CATEGORÍAS:")
    cat_df = analyzer.analisis_por_categoria().head(5)
    for categoria, row in cat_df.iterrows():
        print(f"  • {categoria}: ${row['Total Gastado']:,.2f} ({row['% del Total']:.1f}%)")
    
    # Suscripciones
    suscripciones = analyzer.detectar_suscripciones()
    if suscripciones:
        print(f"\n💳 SUSCRIPCIONES ({len(suscripciones)}):")
        for sus in suscripciones[:3]:
            print(f"  • {sus['descripcion'][:35]}...")
            print(f"    ${sus['monto_mensual']}/mes - {sus['cuenta']}")
    
    # Recomendaciones
    print(f"\n💡 RECOMENDACIONES:")
    for i, rec in enumerate(analyzer.generar_recomendaciones()[:3], 1):
        print(f"\n  {i}. [{rec['categoria']}] {rec['nivel'].upper()}")
        print(f"     {rec['mensaje'][:50]}...")
    
    return analyzer

def menu_principal():
    user_manager = UserManager()
    processor = None
    usuario_actual = None
    analyzer_actual = None  # Guardar analyzer para exportar después
    
    while True:
        mostrar_menu_principal()
        opcion = input("Selecciona (1-4): ").strip()
        
        if opcion == "1":  # Iniciar sesión
            usuario = iniciar_sesion(user_manager)
            if usuario:
                usuario_actual = usuario
                processor = FinancialDataProcessor(user_manager)
                processor.inicializar_para_usuario(usuario.user_id)
                analyzer_actual = None  # Resetear analyzer
                
                while True:
                    print("\n" + "="*60)
                    print(f"👤 {usuario.nombre} | {len(usuario.cuentas)} cuentas configuradas")
                    print("="*60)
                    print("1. Procesar archivos bancarios")
                    print("2. Ver análisis actual")
                    print("3. Exportar reporte")
                    print("4. Gestionar cuentas")
                    print("5. Cerrar sesión")
                    
                    sub = input("\nSelecciona: ").strip()
                    
                    if sub == "1":
                        gestionar_procesamiento_archivos(processor, usuario)
                        analyzer_actual = None  # Invalidar analyzer anterior
                    
                    elif sub == "2":
                        analyzer_actual = mostrar_menu_analisis(processor, usuario)
                    
                    elif sub == "3":
                        if processor.transacciones:
                            if not analyzer_actual:
                                analyzer_actual = FinancialAnalyzer(processor.transacciones, usuario)
                            
                            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                            nombre_archivo = f"reporte_{timestamp}.json"
                            ruta = os.path.join(usuario.carpeta_datos, nombre_archivo)
                            analyzer_actual.exportar_reporte(ruta_salida=ruta)
                        else:
                            print("⚠ No hay datos para exportar.")
                    
                    elif sub == "4":
                        print("\n" + "="*60)
                        print("🏦 TUS CUENTAS CONFIGURADAS")
                        print("="*60)
                        if usuario.cuentas:
                            for c in usuario.cuentas:
                                print(f"  • {c.nombre_cuenta} ({c.banco})")
                                print(f"    Tipo: {c.tipo_cuenta} | Ref: {c.numero_cuenta or 'N/A'}")
                        else:
                            print("  No tienes cuentas configuradas aún.")
                            print("  Se crearán automáticamente al procesar archivos.")
                    
                    elif sub == "5":
                        print(f"👋 Hasta luego, {usuario.nombre}!")
                        break
        
        elif opcion == "2":  # Crear usuario
            nuevo = crear_nuevo_usuario(user_manager)
            if nuevo:
                print(f"\n✓ Usuario creado. ID: {nuevo.user_id}")
        
        elif opcion == "3":  # Listar usuarios
            usuarios = user_manager.listar_usuarios()
            if usuarios:
                print("\n📋 Usuarios registrados:")
                for u in usuarios:
                    print(f"  • {u.nombre} ({u.user_id})")
                    print(f"    Cuentas: {len(u.cuentas)}")
            else:
                print("⚠ No hay usuarios.")
        
        elif opcion == "4":  # Salir
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
    except ImportError:
        print("⚠ Instala dependencias: pip install pandas numpy openpyxl xlrd")
        sys.exit(1)
    
    menu_principal()
