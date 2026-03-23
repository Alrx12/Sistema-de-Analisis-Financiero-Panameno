import pandas as pd
import re
from pathlib import Path

# Rutas de archivos
data_path = "C:/Users/Alexis Pineda/Downloads/Movimientos consolidados de Alexis Pineda.xlsx"
catalog_path = "C:/Users/Alexis Pineda/Downloads/catalogo de categorias.xlsx" 
output_path = "C:/Users/Alexis Pineda/Downloads/Movimientos_consolidados_actualizado.xlsx"

# Cargar datos
print("Cargando archivos...")
df = pd.read_excel(data_path)
catalog = pd.read_excel(catalog_path)

# Limpiar filas de encabezado duplicado (la primera fila es el header también)
df = df[df['DIA '] != 'DIA '].reset_index(drop=True)

# Convertir columnas numéricas
num_cols = ['Retiro', 'Depósito', 'Monto', 'Monto_real', 'Saldo', 'RET', 'DEP']
for col in num_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce')

# Columnas a rellenar
campos_catalogo = ['Economic Type', 'SubType Economic', 'Tipo de transacción', 
                   'Categoría de presupuesto', 'budget_role']

print(f"Filas totales: {len(df)}")
print(f"Filas con datos completos: {len(df.dropna(subset=campos_catalogo, how='any'))}")
print(f"Filas con campos vacíos: {len(df[df[campos_catalogo].isna().all(axis=1)])}")

# ============================================================
# PASO 1: Extraer reglas de las filas ya categorizadas
# ============================================================

def extract_rules_from_labeled_data(df_labeled):
    """Extrae patrones de las filas que ya tienen categorías asignadas"""
    rules = {
        'by_detail_exact': {},  # Match exacto de Detalle
        'by_detail_contains': {},  # Match parcial
        'by_canal_type': {}  # Por canal + tipo de movimiento
    }
    
    for _, row in df_labeled.iterrows():
        detail = str(row['Detalle']).strip().upper()
        canal = str(row['Canal']).strip() if pd.notna(row['Canal']) else ''
        tipo_mov = str(row['Tipos de Movimientos']).strip() if pd.notna(row['Tipos de Movimientos']) else ''
        
        # Crear clave de categorización
        cat_key = {
            'Economic Type': row['Economic Type'],
            'SubType Economic': row['SubType Economic'],
            'Tipo de transacción': row['Tipo de transacción'],
            'Categoría de presupuesto': row['Categoría de presupuesto'],
            'budget_role': row['budget_role']
        }
        
        # Solo si tenemos datos completos
        if all(pd.notna(v) for v in cat_key.values()):
            # Regla por detalle exacto
            if detail not in rules['by_detail_exact']:
                rules['by_detail_exact'][detail] = cat_key
            
            # Regla por canal + tipo
            combo_key = f"{canal}|{tipo_mov}"
            if combo_key not in rules['by_canal_type']:
                rules['by_canal_type'][combo_key] = cat_key
    
    return rules

# Filas ya etiquetadas
df_labeled = df.dropna(subset=campos_catalogo, how='any')
rules = extract_rules_from_labeled_data(df_labeled)

print(f"Reglas extraídas de {len(df_labeled)} filas etiquetadas")

# ============================================================
# PASO 2: Funciones de clasificación basadas en reglas
# ============================================================

def classify_by_detail_rules(detail):
    """Clasifica basado en patrones en el detalle"""
    detail_upper = str(detail).strip().upper()
    
    # Diccionario de patrones → categorías
    patterns = {
        # COMISIONES
        r'COMISION|COMPASS|SEGURO CONTRA FRAUDE|PROTECCION ROBO|ITBMS': {
            'Economic Type': 'comision',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'comision',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'gasto_operativo'
        },
        
        # PAGOS DE DEUDA/TDC
        r'PAGO.*TDC|PAGO.*TARJETA|PAGO DEBITADO|DEUDA': {
            'Economic Type': 'pago_deuda',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'deuda',
            'Categoría de presupuesto': 'deuda',
            'budget_role': 'gasto_financiero'
        },
        
        # TRANSFERENCIAS PROPIAS (entre cuentas del mismo usuario)
        r'TRANSFERENCIA.*CUENTAS PROPIAS|TRANSF\..*PROPIAS|DE CC A AH|DE AH A CC|CREDITO TRANSF\. DE': {
            'Economic Type': 'transferencia_propia',
            'SubType Economic': 'interno',
            'Tipo de transacción': 'transferencia',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'solo_balance'
        },
        
        # TRANSFERENCIAS A TERCEROS
        r'TRANSFERENCIA.*TERCEROS|ACH XPRESS.*A |YAPPY BG A |DB ACH XPRESS APP': {
            'Economic Type': 'transferencia_tercero',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'transferencia',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        },
        
        # INGRESOS/YAPPY RECIBIDOS
        r'YAPPY BG DE |CR TRAN\.|CR PAGO DE PLANILLA|CREDITO.*TRANSF': {
            'Economic Type': 'otros_ingresos',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'ingreso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        },
        
        # COMPRAS/SERVICIOS (Spotify, Netflix, etc)
        r'SPOTIFY|NETFLIX|DISNEY|GOOGLE|APPLE|MICROSOFT|PAYPAL|NORTON|UBER': {
            'Economic Type': 'gasto',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'servicios',
            'budget_role': 'presupuestable'
        },
        
        # COMPRAS EN SUPER/RESTAURANTES
        r'PEDIDOSYA|MCDONALD|KFC|RESTAURANT|CAFE|GELATIAMO|TIM HORTON|NATUVIVA|DO IT|REY |SUPER |HIPER |FARMACIA|CLINICA|VETERINARIA|RADVET': {
            'Economic Type': 'gasto',
            'SubType Economic': 'extraordinario',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'alimentacion',
            'budget_role': 'presupuestable'
        },
        
        # GASOLINA/TRANSPORTE
        r'TEXACO|ESTACION T|GASOLINA|UBER R|TRANSPORTE': {
            'Economic Type': 'gasto',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'Gasolina',
            'budget_role': 'presupuestable'
        },
        
        # RETIROS ATM
        r'ATM RET|RETIRO ATM': {
            'Economic Type': 'gasto',
            'SubType Economic': 'extraordinario',
            'Tipo de transacción': 'flujo_caja',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        },
        
        # INTERESES
        r'INTERES': {
            'Economic Type': 'otros_ingresos',
            'SubType Economic': 'extraordinario',
            'Tipo de transacción': 'Interes',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'solo_balance'
        },
        
        # MANTENIMIENTO/VIVIENDA
        r'ASAMBLEA|MANTENIMIENTO|CUOTA MANT': {
            'Economic Type': 'gasto',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'vivienda',
            'budget_role': 'presupuestable'
        },
        
        # SERVICIOS (ENSA, Tigo, etc)
        r'ENSA|TIGO |CABLE|INTERNET|AGUA|LUZ': {
            'Economic Type': 'gasto',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'servicios',
            'budget_role': 'presupuestable'
        },
        
        # COMPRAS INTERNACIONALES/E-COMMERCE
        r'E-COMMERCE|COMPRA.*INTL|POS COMPRA': {
            'Economic Type': 'gasto',
            'SubType Economic': 'extraordinario',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        },
        
        # DEVOLUCIONES/REEMBOLSOS
        r'DEVOLUCION|REEMBOLSO|REV DB': {
            'Economic Type': 'reembolso',
            'SubType Economic': 'extraordinario',
            'Tipo de transacción': 'reembolso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'solo_balance'
        },
        
        # PRÉSTAMOS
        r'PRESTAMO|CARTERA ND': {
            'Economic Type': 'prestamo',
            'SubType Economic': 'financiero',
            'Tipo de transacción': 'deuda',
            'Categoría de presupuesto': 'deuda',
            'budget_role': 'gasto_financiero'
        }
    }
    
    for pattern, categories in patterns.items():
        if re.search(pattern, detail_upper):
            return categories
    
    return None

def classify_by_canal_tipo(row):
    """Clasificación fallback basada en canal y tipo de movimiento"""
    canal = str(row['Canal']).strip().upper() if pd.notna(row['Canal']) else ''
    tipo = str(row['Tipos de Movimientos']).strip().upper() if pd.notna(row['Tipos de Movimientos']) else ''
    retiro = row['Retiro'] if pd.notna(row['Retiro']) else 0
    deposito = row['Depósito'] if pd.notna(row['Depósito']) else 0
    
    # Débitos (salidas de dinero)
    if tipo == 'DEBITOS' or retiro > 0:
        if 'BANCA MOVIL' in str(row['Detalle']).upper() and 'RECARGA' in str(row['Detalle']).upper():
            return {
                'Economic Type': 'gasto',
                'SubType Economic': 'recurrente',
                'Tipo de transacción': 'gasto',
                'Categoría de presupuesto': 'transporte',
                'budget_role': 'presupuestable'
            }
        
        return {
            'Economic Type': 'gasto',
            'SubType Economic': 'desconocido',
            'Tipo de transacción': 'gasto',
            'Categoría de presupuesto': 'consumo_desconocido',
            'budget_role': 'revisar'
        }
    
    # Créditos (entradas de dinero)
    elif tipo == 'CREDITOS' or deposito > 0:
        return {
            'Economic Type': 'otros_ingresos',
            'SubType Economic': 'desconocido',
            'Tipo de transacción': 'ingreso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        }
    
    return None

# ============================================================
# PASO 3: Aplicar clasificación a filas vacías
# ============================================================

print("Aplicando clasificación...")

filas_actualizadas = 0
for idx in df[df[campos_catalogo].isna().all(axis=1)].index:
    detail = df.loc[idx, 'Detalle']
    
    # Intentar 1: Reglas basadas en detalle
    categorias = classify_by_detail_rules(detail)
    
    # Intentar 2: Reglas basadas en canal/tipo
    if categorias is None:
        categorias = classify_by_canal_tipo(df.loc[idx])
    
    # Intentar 3: Match exacto con datos ya etiquetados
    if categorias is None:
        detail_upper = str(detail).strip().upper()
        if detail_upper in rules['by_detail_exact']:
            categorias = rules['by_detail_exact'][detail_upper]
    
    # Aplicar categorías si se encontraron
    if categorias:
        for campo, valor in categorias.items():
            df.loc[idx, campo] = valor
        filas_actualizadas += 1

print(f"Filas actualizadas: {filas_actualizadas}")

# ============================================================
# PASO 4: Verificar y reportar
# ============================================================

print("\n" + "="*60)
print("RESUMEN DE CATEGORIZACIÓN")
print("="*60)

for campo in campos_catalogo:
    print(f"\n{campo}:")
    print(df[campo].value_counts(dropna=False).head(10))

# Filas que quedaron sin categorizar
sin_categorizar = df[df[campos_catalogo].isna().any(axis=1)]
print(f"\n\nFilas sin categorizar completamente: {len(sin_categorizar)}")

if len(sin_categorizar) > 0:
    print("\nMuestra de filas sin categorizar:")
    print(sin_categorizar[['Detalle', 'Canal', 'Tipos de Movimientos'] + campos_catalogo].head(10))

# ============================================================
# PASO 5: Guardar resultado
# ============================================================

# Crear directorio si no existe
Path(output_path).parent.mkdir(parents=True, exist_ok=True)

# Guardar
df.to_excel(output_path, index=False)
print(f"\n✅ Archivo guardado en: {output_path}")

# También guardar CSV por si acaso
csv_path = output_path.replace('.xlsx', '.csv')
df.to_csv(csv_path, index=False)
print(f"✅ También guardado como CSV en: {csv_path}")