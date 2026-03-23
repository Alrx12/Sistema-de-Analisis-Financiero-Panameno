import pandas as pd
import re
import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime


class FinancialClassifier:
    def __init__(self, knowledge_base_path="knowledge_base.json", user_name=None):
        """
        Args:
            knowledge_base_path: Ruta al JSON de conocimiento acumulado.
            user_name: Nombre completo del usuario registrado en la app.
                       Ej: "Alexis Pineda" o "María González".
                       Si se provee, las transacciones que contengan este nombre
                       se clasificarán automáticamente como transferencia_propia.
        """
        self.knowledge_base_path = knowledge_base_path

        # ── Nombre del usuario ──────────────────────────────────────────────
        # Se normaliza a mayúsculas y se divide en tokens individuales
        # para hacer búsqueda parcial (match con nombre O apellido).
        self.user_name = user_name.strip().upper() if user_name else None
        self.user_name_tokens = (
            [t for t in self.user_name.split() if len(t) >= 3]
            if self.user_name else []
        )
        # ────────────────────────────────────────────────────────────────────

        self.rules = {
            'exact_matches': {},
            'patterns': {},
            'word_weights': defaultdict(lambda: defaultdict(float)),
            'corrections_count': 0
        }
        self.load_knowledge()

    # ── Categorías canónicas ─────────────────────────────────────────────────

    OWN_TRANSFER_CATEGORIES = {
        'Economic Type': 'transferencia_propia',
        'SubType Economic': 'interno',
        'Tipo de transacción': 'transferencia',
        'Categoría de presupuesto': 'ahorro',
        'budget_role': 'solo_balance'
    }

    THIRD_PARTY_TRANSFER_CATEGORIES = {
        'Economic Type': 'transferencia_tercero',
        'SubType Economic': 'operativo',
        'Tipo de transacción': 'transferencia',
        'Categoría de presupuesto': 'otros',
        'budget_role': 'presupuestable'
    }

    # ── Detección de nombre ──────────────────────────────────────────────────

    def _contains_user_name(self, detail_upper: str, is_transfer: bool = False) -> bool:
        """
        Retorna True si el detalle contiene el nombre completo del usuario
        o al menos dos tokens del nombre (nombre + apellido).

        Caso especial: los bancos truncan el nombre en el detalle (ej. "ALEXIS ANTONIO PI"
        en lugar de "ALEXIS ANTONIO PINEDA DEL CID"). Para transferencias ACH/XPRESS,
        se acepta match con 1 solo token del nombre para no clasificar erróneamente
        como tercero.
        """
        if not self.user_name_tokens:
            return False

        # Match exacto del nombre completo
        if self.user_name in detail_upper:
            return True

        hits = sum(1 for token in self.user_name_tokens if token in detail_upper)

        # En transferencias ACH/XPRESS el banco puede truncar el apellido,
        # entonces 1 token (nombre de pila) ya es suficiente para considerar
        # que es una transferencia propia.
        if is_transfer and hits >= 1:
            return True

        # En contextos no-ACH exigimos al menos 2 tokens para evitar falsos positivos
        return hits >= min(2, len(self.user_name_tokens))

    def _is_transfer_type(self, row) -> bool:
        """Heurística: ¿el movimiento es una transferencia según el tipo o el detalle?"""
        detail = str(row.get('Detalle', '')).upper()
        tipo = str(row.get('Tipos de Movimientos', '')).upper()
        transfer_keywords = ['ACH', 'XPRESS', 'TRANSFERENCIA', 'TRANSFER', 'TRF', 'TRANSF']
        return any(kw in detail or kw in tipo for kw in transfer_keywords)

    # ── Motor de predicción ──────────────────────────────────────────────────

    # Reglas built-in para patrones de crédito comunes
    # Estas cubren los casos que el banco formatea de forma estándar
    CREDIT_PATTERNS = [
        # Salario / planilla
        (r'PLANILLA|SALARIO|NOMINA|PAYROLL', {
            'Economic Type': 'salario',
            'SubType Economic': 'recurrente',
            'Tipo de transacción': 'ingreso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        }, 0.95, 'builtin:salario'),
        # Devoluciones / reversiones
        (r'DEVOLUCION|REVERSO|REV DB|AJUSTE CTE', {
            'Economic Type': 'reembolso',
            'SubType Economic': 'variable',
            'Tipo de transacción': 'reembolso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'solo_balance'
        }, 0.92, 'builtin:devolucion'),
        # Transferencias entre cuentas propias (CC a CC, AH a CC, etc.)
        (r'CREDITO TRANSF\. DE (CC|AH) A (CC|AH)', {
            'Economic Type': 'transferencia_propia',
            'SubType Economic': 'interno',
            'Tipo de transacción': 'transferencia',
            'Categoría de presupuesto': 'ahorro',
            'budget_role': 'solo_balance'
        }, 0.92, 'builtin:transf_propia_cc'),
        # YAPPY recibido de tercero
        (r'YAPPY BG DE ', {
            'Economic Type': 'transferencia_tercero',
            'SubType Economic': 'variable',
            'Tipo de transacción': 'ingreso',
            'Categoría de presupuesto': 'otros',
            'budget_role': 'presupuestable'
        }, 0.88, 'builtin:yappy_entrada'),
    ]

    def predict(self, row):
        """
        Orden de prioridad:
          0. Detección de nombre de usuario (transferencia propia/tercero)
          1. Match exacto en knowledge base
          2. Patrones regex aprendidos
          3. Patrones built-in para créditos comunes
          4. Fallback por tipo de movimiento (débito o crédito genérico)
        """
        detail = str(row.get('Detalle', '')).strip().upper()
        tipo = str(row.get('Tipos de Movimientos', '')).upper()
        is_transfer = self._is_transfer_type(row)

        # ── PASO 0: Detección de nombre de usuario ───────────────────────────
        if self.user_name and self._contains_user_name(detail, is_transfer=is_transfer):
            return self.OWN_TRANSFER_CATEGORIES, 1.0, "own_transfer:name_match"

        # Si es transferencia ACH/XPRESS sin el nombre del usuario → tercero
        if is_transfer and self.user_name:
            return self.THIRD_PARTY_TRANSFER_CATEGORIES, 0.85, "third_party_transfer:name_absent"
        # ─────────────────────────────────────────────────────────────────────

        # ── PASO 1: Match exacto ─────────────────────────────────────────────
        if detail in self.rules['exact_matches']:
            return self.rules['exact_matches'][detail], 1.0, "exact"

        # ── PASO 2: Patrones regex aprendidos ────────────────────────────────
        for name, pat in self.rules['patterns'].items():
            if re.search(pat['regex'], detail):
                return pat['categories'], 0.9, f"pattern:{name}"

        # ── PASO 3: Patrones built-in para créditos ──────────────────────────
        # Se aplican antes del fallback para no dejar créditos sin categoría
        is_credit = 'CREDIT' in tipo or 'CRED' in tipo or row.get('Depósito', 0) > 0
        if is_credit:
            for pattern, categories, conf, method_name in self.CREDIT_PATTERNS:
                if re.search(pattern, detail):
                    return categories, conf, method_name

        # ── PASO 4: Fallback por tipo de movimiento ───────────────────────────
        if 'DEBIT' in tipo or row.get('Retiro', 0) > 0:
            return {
                'Economic Type': 'gasto',
                'SubType Economic': 'desconocido',
                'Tipo de transacción': 'gasto',
                'Categoría de presupuesto': 'consumo_desconocido',
                'budget_role': 'revisar'
            }, 0.3, "fallback_debito"

        # Fallback crédito genérico — antes retornaba None y quedaban en blanco
        if is_credit:
            return {
                'Economic Type': 'otros_ingresos',
                'SubType Economic': 'desconocido',
                'Tipo de transacción': 'ingreso',
                'Categoría de presupuesto': 'otros',
                'budget_role': 'revisar'
            }, 0.3, "fallback_credito"

        return None, 0.0, "unknown"

    # ── Aprendizaje ──────────────────────────────────────────────────────────

    def load_knowledge(self):
        if Path(self.knowledge_base_path).exists():
            with open(self.knowledge_base_path, 'r') as f:
                data = json.load(f)
                self.rules['exact_matches'] = data.get('exact_matches', {})
                self.rules['patterns'] = data.get('patterns', {})
                self.rules['corrections_count'] = data.get('corrections_count', 0)
                for word, cats in data.get('word_weights', {}).items():
                    for cat, weight in cats.items():
                        self.rules['word_weights'][word][cat] = weight
            print(f"📚 Conocimiento cargado: {self.rules['corrections_count']} correcciones previas")

    def save_knowledge(self):
        data = {
            'last_updated': datetime.now().isoformat(),
            'exact_matches': self.rules['exact_matches'],
            'patterns': self.rules['patterns'],
            'word_weights': {k: dict(v) for k, v in self.rules['word_weights'].items()},
            'corrections_count': self.rules['corrections_count']
        }
        with open(self.knowledge_base_path, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"💾 Conocimiento guardado: {self.rules['corrections_count']} correcciones totales")

    def learn_from_corrections(self, corrections_file):
        """Aprende de las correcciones manuales en PARA_REVISAR.xlsx"""
        df = pd.read_excel(corrections_file)
        campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
                  'Categoría de presupuesto', 'budget_role']

        learned = 0

        for _, row in df.iterrows():
            categories = {}
            has_correction = False

            for campo in campos:
                corrected_val = row.get(f"{campo}_corrected") if f"{campo}_corrected" in df.columns else None
                original_val = row.get(campo)

                if pd.notna(corrected_val) and corrected_val != original_val:
                    categories[campo] = corrected_val
                    has_correction = True
                elif pd.notna(original_val):
                    categories[campo] = original_val

            if row.get('manual_review') is True:
                has_correction = True

            if has_correction and categories:
                detail = str(row['Detalle']).strip().upper()
                self.rules['exact_matches'][detail] = categories

                words = re.findall(r'\b[A-Z]{3,}\b', detail)
                for word in words:
                    for campo, valor in categories.items():
                        key = f"{campo}={valor}"
                        self.rules['word_weights'][word][key] += 1.0

                self._create_pattern(detail, categories)
                learned += 1
                self.rules['corrections_count'] += 1

        print(f"🎓 Aprendidas {learned} correcciones nuevas")
        self.save_knowledge()
        return learned

    def _create_pattern(self, detail, categories):
        """Extrae patrones automáticamente de correcciones"""
        common = {'TRANSFERENCIA', 'PAGO', 'DE', 'LA', 'EL', 'POR', 'BG', 'A'}
        words = [w for w in re.findall(r'\b[A-Z]{4,}\b', detail) if w not in common]

        # No crear patrones a partir del nombre del usuario para evitar
        # que generalicen incorrectamente a otros usuarios.
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        for word in words[:3]:
            pat_name = f"{categories['Economic Type']}_{word}"
            if pat_name not in self.rules['patterns']:
                self.rules['patterns'][pat_name] = {
                    'regex': r'\b' + re.escape(word) + r'\b',
                    'categories': categories,
                    'source': 'learned'
                }


# ── Flujos de trabajo ────────────────────────────────────────────────────────

def main_workflow(user_name: str = "Alexis Pineda"):
    """
    Flujo principal de clasificación.

    Args:
        user_name: Nombre del usuario registrado en la app.
                   En producción, este valor vendrá del perfil del usuario.
                   Ejemplo: main_workflow(user_name="María González")
    """

    print(f"👤 Usuario: {user_name}")

    # 1. Inicializar con el nombre del usuario
    clf = FinancialClassifier(user_name=user_name)

    # 2. Cargar estado de cuenta
    input_file = "C:/Users/Alexis Pineda/Downloads/Movimientos consolidados de Alexis Pineda.xlsx"
    df = pd.read_excel(input_file)

    # Limpiar si hay header duplicado
    if str(df.iloc[0].get('DIA ', '')) == 'DIA ':
        df = df.iloc[1:].reset_index(drop=True)

    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']

    # 3. Clasificar filas vacías
    for idx in df[df[campos].isna().all(axis=1)].index:
        cats, conf, method = clf.predict(df.loc[idx])
        if cats:
            for c, v in cats.items():
                df.loc[idx, c] = v
            df.loc[idx, 'confidence'] = conf
            df.loc[idx, 'method'] = method

    # 4. Separar los de baja confianza para revisión manual
    # IMPORTANTE: en pandas, NaN < 0.6 evalúa como False.
    # Por eso usamos | isna() para capturar también las filas sin confidence asignado.
    if 'confidence' in df.columns:
        mask_revisar = (df['confidence'] < 0.6) | (df['confidence'].isna())
        baja_confianza = df[mask_revisar].copy()
    else:
        baja_confianza = pd.DataFrame()

    if len(baja_confianza) > 0:
        for campo in campos:
            baja_confianza[f"{campo}_corrected"] = baja_confianza[campo]
        baja_confianza['manual_review'] = False
        baja_confianza['notas'] = ''

        baja_confianza.to_excel("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx", index=False)
        print(f"📝 {len(baja_confianza)} filas en PARA_REVISAR.xlsx para revisión")

    # 5. Agregar columna 'reclasificar' para que el usuario pueda marcar filas a corregir
    # El usuario abre RESULTADO_CLASIFICADO.xlsx, pone True en las filas incorrectas,
    # guarda, y ejecuta: python script.py reclasify
    if 'reclasificar' not in df.columns:
        df['reclasificar'] = False
    if 'nota_reclasificacion' not in df.columns:
        df['nota_reclasificacion'] = ''

    # 6. Guardar resultado completo
    df.to_excel("C:/Users/Alexis Pineda/Downloads/RESULTADO_CLASIFICADO.xlsx", index=False)
    print("✅ Resultado guardado en RESULTADO_CLASIFICADO.xlsx")
    print("💡 Para corregir clasificaciones: pon True en la columna 'reclasificar',")
    print("   guarda el archivo y ejecuta: python script.py reclasify")

    return clf


def apply_learning(user_name: str = "Alexis Pineda"):
    """Ejecuta ESTO después de corregir PARA_REVISAR.xlsx"""
    clf = FinancialClassifier(user_name=user_name)

    if not Path("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx").exists():
        print("❌ No se encontró PARA_REVISAR.xlsx")
        return

    print("\n" + "=" * 50)
    print("MODO APRENDIZAJE")
    print("=" * 50)
    print("Asegúrate de haber:")
    print("1. Editado las columnas *_corrected")
    print("2. Marcado manual_review = True donde corregiste")
    print("=" * 50)

    nuevas = clf.learn_from_corrections("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx")
    print(f"\n✅ Modelo actualizado con {nuevas} correcciones")
    print("La próxima ejecución clasificará mejor!")




def prepare_reclassification(user_name: str = "Alexis Pineda"):
    """
    PASO 1 DEL FLUJO DE RECLASIFICACIÓN.

    Lee RESULTADO_CLASIFICADO.xlsx, extrae las filas donde
    'reclasificar' == True y genera PARA_RECLASIFICAR.xlsx con
    columnas *_corrected pre-llenadas con los valores actuales.

    El usuario edita las columnas *_corrected con los valores correctos
    y luego ejecuta: python script.py reclasify_learn
    """
    resultado_path = "C:/Users/Alexis Pineda/Downloads/RESULTADO_CLASIFICADO.xlsx"
    salida_path    = "C:/Users/Alexis Pineda/Downloads/PARA_RECLASIFICAR.xlsx"
    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']

    if not Path(resultado_path).exists():
        print("❌ No se encontró RESULTADO_CLASIFICADO.xlsx")
        return

    df = pd.read_excel(resultado_path)

    if 'reclasificar' not in df.columns:
        print("⚠️  El archivo no tiene la columna 'reclasificar'.")
        print("   Vuelve a ejecutar el flujo principal (python script.py) para regenerarlo.")
        return

    # Normalizar: acepta True, 'True', 'true', 1, 'SI', 'si', 'yes'
    df['reclasificar'] = df['reclasificar'].astype(str).str.strip().str.lower()
    marcadas = df[df['reclasificar'].isin(['true', '1', 'si', 'yes', 'sí'])].copy()

    if len(marcadas) == 0:
        print("ℹ️  No hay filas marcadas para reclasificar.")
        print("   Abre RESULTADO_CLASIFICADO.xlsx, pon True en la columna 'reclasificar'")
        print("   en las filas con clasificación incorrecta y guarda el archivo.")
        return

    # Pre-llenar columnas _corrected con los valores actuales
    # El usuario SOLO cambia los campos que están mal
    for campo in campos:
        marcadas[f"{campo}_corrected"] = marcadas[campo]
    marcadas['manual_review'] = True   # Ya marcado — el usuario solo corrige los valores
    marcadas['nota_reclasificacion'] = marcadas.get('nota_reclasificacion', '')

    marcadas.to_excel(salida_path, index=False)
    print(f"\n✏️  {len(marcadas)} filas exportadas a PARA_RECLASIFICAR.xlsx")
    print("\nPRÓXIMO PASO:")
    print("  1. Abre PARA_RECLASIFICAR.xlsx")
    print("  2. Corrige las columnas que dicen *_corrected (las demás déjalas igual)")
    print("  3. Opcionalmente agrega una nota en 'nota_reclasificacion'")
    print("  4. Guarda el archivo")
    print("  5. Ejecuta: python script.py reclasify_learn")


def apply_reclassification_learning(user_name: str = "Alexis Pineda"):
    """
    PASO 2 DEL FLUJO DE RECLASIFICACIÓN.

    Lee PARA_RECLASIFICAR.xlsx, aprende de los cambios y actualiza
    RESULTADO_CLASIFICADO.xlsx con las nuevas clasificaciones.
    También resetea el flag 'reclasificar' en las filas corregidas.
    """
    clf = FinancialClassifier(user_name=user_name)
    reclasif_path  = "C:/Users/Alexis Pineda/Downloads/PARA_RECLASIFICAR.xlsx"
    resultado_path = "C:/Users/Alexis Pineda/Downloads/RESULTADO_CLASIFICADO.xlsx"
    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']

    if not Path(reclasif_path).exists():
        print("❌ No se encontró PARA_RECLASIFICAR.xlsx")
        print("   Primero ejecuta: python script.py reclasify")
        return

    df_reclas = pd.read_excel(reclasif_path)
    df_result = pd.read_excel(resultado_path)

    print("\n" + "=" * 50)
    print("APRENDIZAJE DE RECLASIFICACIONES")
    print("=" * 50)

    aprendidas = 0
    actualizadas = 0
    detalles_procesados = []

    for _, row in df_reclas.iterrows():
        categories = {}
        has_change = False

        for campo in campos:
            corrected_val = row.get(f"{campo}_corrected")
            original_val  = row.get(campo)

            if pd.notna(corrected_val) and str(corrected_val).strip() != str(original_val).strip():
                categories[campo] = corrected_val
                has_change = True
            elif pd.notna(corrected_val):
                categories[campo] = corrected_val
            elif pd.notna(original_val):
                categories[campo] = original_val

        if not categories:
            continue

        detail = str(row['Detalle']).strip().upper()
        detalles_procesados.append(detail)

        # ── Aprender ──────────────────────────────────────────────────────────
        if has_change:
            # Guardar en exact_matches (máxima prioridad futura)
            clf.rules['exact_matches'][detail] = categories

            # Aprender palabras clave (excluyendo tokens del nombre de usuario)
            words = re.findall(r'\b[A-Z]{3,}\b', detail)
            if clf.user_name_tokens:
                words = [w for w in words if w not in clf.user_name_tokens]
            for word in words:
                for campo, valor in categories.items():
                    clf.rules['word_weights'][word][f"{campo}={valor}"] += 2.0  # peso alto por ser corrección explícita

            clf._create_pattern(detail, categories)
            clf.rules['corrections_count'] += 1
            aprendidas += 1

        # ── Actualizar RESULTADO_CLASIFICADO ──────────────────────────────────
        mask = df_result['Detalle'].str.strip().str.upper() == detail
        if mask.any():
            for campo, valor in categories.items():
                df_result.loc[mask, campo] = valor
            df_result.loc[mask, 'confidence']         = 1.0
            df_result.loc[mask, 'method']             = 'reclassified_by_user'
            df_result.loc[mask, 'reclasificar']       = False   # resetear flag
            actualizadas += mask.sum()

    clf.save_knowledge()
    df_result.to_excel(resultado_path, index=False)

    print(f"\n✅ {aprendidas} patrones nuevos aprendidos")
    print(f"✅ {actualizadas} filas actualizadas en RESULTADO_CLASIFICADO.xlsx")
    print("🎯 El modelo aplicará estas correcciones a futuras transacciones similares")

# ── Punto de entrada ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # ── ¿Cómo obtener el nombre del usuario en tu app? ─────────────────────
    #
    # OPCIÓN A — Argumento por línea de comandos (útil para pruebas):
    #   python script.py run "María González"
    #   → USER_NAME = sys.argv[2] if len(sys.argv) > 2 else "Alexis Pineda"
    #
    # OPCIÓN B — Variable de entorno (recomendado para producción):
    #   Setear: APP_USER_NAME="María González" python script.py
    #   → USER_NAME = os.environ.get("APP_USER_NAME", "Alexis Pineda")
    #
    # OPCIÓN C — Desde sesión de Flask / FastAPI / Django:
    #   Flask:   USER_NAME = current_user.full_name
    #   FastAPI: USER_NAME = current_user.full_name   (inyectado con Depends)
    #   Django:  USER_NAME = request.user.get_full_name()
    #
    # OPCIÓN D — Desde base de datos (si tienes un user_id):
    #   usuario = db.query(User).filter(User.id == user_id).first()
    #   USER_NAME = f"{usuario.nombre} {usuario.apellido}"
    #
    # POR AHORA (modo prueba local):
    USER_NAME = "Alexis Pineda"  # ← Reemplazar con cualquiera de las opciones arriba

    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"

    if cmd == "learn":
        # Aprender de PARA_REVISAR.xlsx (baja confianza)
        apply_learning(user_name=USER_NAME)

    elif cmd == "reclasify":
        # Paso 1: exportar filas marcadas en RESULTADO_CLASIFICADO a PARA_RECLASIFICAR
        prepare_reclassification(user_name=USER_NAME)

    elif cmd == "reclasify_learn":
        # Paso 2: aprender de PARA_RECLASIFICAR y actualizar RESULTADO_CLASIFICADO
        apply_reclassification_learning(user_name=USER_NAME)

    else:
        # Clasificación normal
        main_workflow(user_name=USER_NAME)
        print("\n" + "=" * 50)
        print("COMANDOS DISPONIBLES:")
        print()
        print("  python script.py")
        print("    → Clasificar nuevas transacciones")
        print()
        print("  python script.py learn")
        print("    → Aprender de PARA_REVISAR.xlsx (baja confianza)")
        print()
        print("  python script.py reclasify")
        print("    → Exportar filas marcadas en RESULTADO_CLASIFICADO a PARA_RECLASIFICAR.xlsx")
        print()
        print("  python script.py reclasify_learn")
        print("    → Aprender de PARA_RECLASIFICAR.xlsx y actualizar RESULTADO_CLASIFICADO")
        print("=" * 50)
        print("=" * 50)