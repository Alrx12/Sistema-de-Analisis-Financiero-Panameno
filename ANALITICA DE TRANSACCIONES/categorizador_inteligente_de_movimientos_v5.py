import os
import pandas as pd
import re
import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime


# ── Rutas por defecto ─────────────────────────────────────────────────────────
DEFAULT_GLOBAL_KB  = "knowledge_base_global.json"   # compartido todos los usuarios
DEFAULT_USER_KB    = "knowledge_base_user_{}.json"  # {} = user_id o nombre sanitizado


class FinancialClassifier:
    """
    Clasificador de movimientos financieros con dos capas de aprendizaje:

    CAPA GLOBAL (knowledge_base_global.json)
        Patrones que aplican igual a TODOS los usuarios:
        marcas, comercios, tipos de transacción bancaria.
        Ej: UBER → gasto, PLANILLA → salario, COMISION → comision.

    CAPA PERSONAL (knowledge_base_user_{id}.json)
        Patrones específicos del usuario:
        nombres de sus contactos, exact_matches con IDs de transacciones propias.
        Ej: ADRIAN CASTRO → renta (solo para el usuario que tiene ese arrendador).

    Orden de predicción:
        0. Detección de nombre del usuario (propio vs tercero)
        1. Exact match personal
        2. Patrón regex personal
        3. Exact match global
        4. Patrón regex global
        5. Patrones builtin (YAPPY dirección, PLANILLA, devoluciones, etc.)
        6. Fallback por tipo de movimiento
    """

    def __init__(self,
                 global_kb_path: str = DEFAULT_GLOBAL_KB,
                 user_kb_path:   str = None,
                 user_name:      str = None,
                 user_id:        str = None):
        """
        Args:
            global_kb_path : Ruta al JSON global compartido.
            user_kb_path   : Ruta al JSON personal del usuario.
                             Si no se provee, se deriva de user_id o user_name.
            user_name      : Nombre completo registrado en la app.
            user_id        : ID único del usuario (recomendado para producción).
        """
        self.global_kb_path = global_kb_path
        self.user_name  = user_name.strip().upper() if user_name else None
        self.user_name_tokens = (
            [t for t in self.user_name.split() if len(t) >= 3]
            if self.user_name else []
        )

        # Derivar ruta personal si no se indicó explícitamente
        if user_kb_path:
            self.user_kb_path = user_kb_path
        elif user_id:
            self.user_kb_path = DEFAULT_USER_KB.format(user_id)
        elif user_name:
            safe = re.sub(r'[^a-z0-9]', '_', user_name.lower().strip())
            self.user_kb_path = DEFAULT_USER_KB.format(safe)
        else:
            self.user_kb_path = DEFAULT_USER_KB.format("default")

        # Estructuras separadas por capa
        self.global_rules   = self._empty_rules()
        self.personal_rules = self._empty_rules()

        self._load_kb(self.global_kb_path,  self.global_rules,   "global")
        self._load_kb(self.user_kb_path,    self.personal_rules, "personal")

    # ── Helpers de inicialización ─────────────────────────────────────────────

    @staticmethod
    def _empty_rules():
        return {
            'exact_matches':   {},
            'patterns':        {},
            'word_weights':    defaultdict(lambda: defaultdict(float)),
            'corrections_count': 0
        }

    def _load_kb(self, path: str, rules: dict, label: str):
        if Path(path).exists():
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            rules['exact_matches']    = data.get('exact_matches', {})
            rules['patterns']         = data.get('patterns', {})
            rules['corrections_count']= data.get('corrections_count', 0)
            for word, cats in data.get('word_weights', {}).items():
                for cat, weight in cats.items():
                    rules['word_weights'][word][cat] = weight
            print(f"📚 KB {label} cargado: {rules['corrections_count']} correcciones — {path}")

    def _save_kb(self, path: str, rules: dict, label: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            'last_updated':      datetime.now().isoformat(),
            'exact_matches':     rules['exact_matches'],
            'patterns':          rules['patterns'],
            'word_weights':      {k: dict(v) for k, v in rules['word_weights'].items()},
            'corrections_count': rules['corrections_count']
        }
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"💾 KB {label} guardado: {rules['corrections_count']} correcciones — {path}")

    # ── Categorías canónicas ──────────────────────────────────────────────────

    OWN_TRANSFER = {
        'Economic Type': 'transferencia_propia', 'SubType Economic': 'interno',
        'Tipo de transacción': 'transferencia', 'Categoría de presupuesto': 'ahorro',
        'budget_role': 'solo_balance'
    }
    THIRD_TRANSFER = {
        'Economic Type': 'transferencia_tercero', 'SubType Economic': 'operativo',
        'Tipo de transacción': 'transferencia', 'Categoría de presupuesto': 'otros',
        'budget_role': 'presupuestable'
    }

    # ── Patrones builtin (universales, no en JSON) ────────────────────────────
    #
    # YAPPY: el medio de pago, no la categoría.
    # La dirección lo define:
    #   "YAPPY BG DE …"       → recibiste dinero   → ingreso de tercero
    #   "YAPPY BG A …" /
    #   "PAGO YAPPY BG A …"   → pagaste algo        → gasto (el destinatario
    #                                                   define si es gasto o deuda;
    #                                                   el exact_match lo afina)
    BUILTIN_PATTERNS = [
        # Salario / planilla (crédito)
        (r'PLANILLA|SALARIO|NOMINA|PAYROLL',
         {'Economic Type': 'salario', 'SubType Economic': 'recurrente',
          'Tipo de transacción': 'ingreso', 'Categoría de presupuesto': 'otros',
          'budget_role': 'presupuestable'}, 0.95, 'builtin:salario'),

        # Devoluciones / reversiones (crédito)
        (r'CR DEVOLUCION|REV DB POS|REVERSO|AJUSTE CTE',
         {'Economic Type': 'reembolso', 'SubType Economic': 'variable',
          'Tipo de transacción': 'reembolso', 'Categoría de presupuesto': 'otros',
          'budget_role': 'solo_balance'}, 0.93, 'builtin:devolucion'),

        # Intereses de ahorro (crédito pequeño del banco)
        (r'INTERES.*CUENTA|INTERES.*AHORROS',
         {'Economic Type': 'otros_ingresos', 'SubType Economic': 'financiero',
          'Tipo de transacción': 'ingreso', 'Categoría de presupuesto': 'otros',
          'budget_role': 'presupuestable'}, 0.92, 'builtin:interes_ahorro'),

        # Transferencia entre cuentas propias del mismo banco
        (r'CREDITO TRANSF\. DE (CC|AH) A (CC|AH)',
         {'Economic Type': 'transferencia_propia', 'SubType Economic': 'interno',
          'Tipo de transacción': 'transferencia', 'Categoría de presupuesto': 'ahorro',
          'budget_role': 'solo_balance'}, 0.93, 'builtin:transf_propia_cc'),

        # YAPPY recibido de alguien → ingreso / transferencia de tercero
        (r'^YAPPY BG DE ',
         {'Economic Type': 'transferencia_tercero', 'SubType Economic': 'variable',
          'Tipo de transacción': 'ingreso', 'Categoría de presupuesto': 'otros',
          'budget_role': 'presupuestable'}, 0.90, 'builtin:yappy_ingreso'),

        # YAPPY pagado a alguien/comercio → gasto
        # (el exact_match lo refinará a pago_deuda si es EPIKCREDITO, etc.)
        (r'^PAGO YAPPY BG A |^YAPPY BG A ',
         {'Economic Type': 'gasto', 'SubType Economic': 'variable',
          'Tipo de transacción': 'gasto', 'Categoría de presupuesto': 'consumo_desconocido',
          'budget_role': 'revisar'}, 0.82, 'builtin:yappy_gasto'),

        # Comisión bancaria
        (r'COMISION|CARGO ANUAL|CARGO MENSUAL',
         {'Economic Type': 'comision', 'SubType Economic': 'recurrente',
          'Tipo de transacción': 'comision', 'Categoría de presupuesto': 'servicios',
          'budget_role': 'gasto_financiero'}, 0.90, 'builtin:comision'),

        # ITBMS (impuesto)
        (r'\bITBMS\b',
         {'Economic Type': 'impuesto', 'SubType Economic': 'recurrente',
          'Tipo de transacción': 'impuesto', 'Categoría de presupuesto': 'servicios',
          'budget_role': 'gasto_financiero'}, 0.95, 'builtin:itbms'),
    ]

    # ── Detección de nombre ───────────────────────────────────────────────────

    def _contains_user_name(self, detail_upper: str, is_transfer: bool = False) -> bool:
        if not self.user_name_tokens:
            return False
        if self.user_name in detail_upper:
            return True
        hits = sum(1 for t in self.user_name_tokens if t in detail_upper)
        # En ACH/XPRESS el banco trunca el apellido → 1 token basta
        if is_transfer and hits >= 1:
            return True
        return hits >= min(2, len(self.user_name_tokens))

    def _is_transfer_type(self, row) -> bool:
        detail = str(row.get('Detalle', '')).upper()
        tipo   = str(row.get('Tipos de Movimientos', '')).upper()
        # Solo ACH/XPRESS (interbancario) activa la lógica de "nombre ausente = tercero".
        # "CREDITO TRANSF. DE CC A CC" es siempre propia y lo captura builtin:transf_propia_cc.
        ach_xpress = any(kw in detail or kw in tipo for kw in ['ACH', 'XPRESS'])
        transf_generic = any(kw in detail or kw in tipo for kw in ['TRANSFERENCIA', 'TRANSFER', 'TRF', 'TRANSF'])
        return ach_xpress or transf_generic

    def _is_ach_xpress(self, row) -> bool:
        """Solo transferencias interbancarias ACH/XPRESS."""
        detail = str(row.get('Detalle', '')).upper()
        tipo   = str(row.get('Tipos de Movimientos', '')).upper()
        return any(kw in detail or kw in tipo for kw in ['ACH', 'XPRESS'])

    # ── Motor de predicción ───────────────────────────────────────────────────

    def predict(self, row):
        detail      = str(row.get('Detalle', '')).strip().upper()
        tipo        = str(row.get('Tipos de Movimientos', '')).upper()
        is_transfer = self._is_transfer_type(row)
        is_credit   = 'CREDIT' in tipo or 'CRED' in tipo or row.get('Depósito', 0) > 0

        # 0. Nombre del usuario ────────────────────────────────────────────────
        if self.user_name and self._contains_user_name(detail, is_transfer):
            return self.OWN_TRANSFER, 1.0, "own_transfer:name_match"
        if self._is_ach_xpress(row) and self.user_name:
            return self.THIRD_TRANSFER, 0.85, "third_party_transfer:name_absent"

        # 1. Exact match personal ──────────────────────────────────────────────
        if detail in self.personal_rules['exact_matches']:
            return self.personal_rules['exact_matches'][detail], 1.0, "exact:personal"

        # 2. Patrón regex personal ─────────────────────────────────────────────
        for name, pat in self.personal_rules['patterns'].items():
            if re.search(pat['regex'], detail):
                return pat['categories'], 0.92, f"pattern:personal:{name}"

        # 3. Exact match global ────────────────────────────────────────────────
        if detail in self.global_rules['exact_matches']:
            return self.global_rules['exact_matches'][detail], 1.0, "exact:global"

        # 4. Patrón regex global ───────────────────────────────────────────────
        for name, pat in self.global_rules['patterns'].items():
            if re.search(pat['regex'], detail):
                return pat['categories'], 0.90, f"pattern:global:{name}"

        # 5. Patrones builtin ──────────────────────────────────────────────────
        for pattern, categories, conf, method_name in self.BUILTIN_PATTERNS:
            if re.search(pattern, detail):
                return categories, conf, method_name

        # 6. Fallback por tipo ─────────────────────────────────────────────────
        if 'DEBIT' in tipo or row.get('Retiro', 0) > 0:
            return {
                'Economic Type': 'gasto', 'SubType Economic': 'desconocido',
                'Tipo de transacción': 'gasto',
                'Categoría de presupuesto': 'consumo_desconocido',
                'budget_role': 'revisar'
            }, 0.3, "fallback_debito"

        if is_credit:
            return {
                'Economic Type': 'otros_ingresos', 'SubType Economic': 'desconocido',
                'Tipo de transacción': 'ingreso',
                'Categoría de presupuesto': 'otros',
                'budget_role': 'revisar'
            }, 0.3, "fallback_credito"

        return None, 0.0, "unknown"

    # ── Aprendizaje ───────────────────────────────────────────────────────────

    # Palabras que son suficientemente específicas para ir al KB global
    # (marcas, servicios, términos bancarios reconocibles universalmente)
    GLOBAL_KEYWORDS = {
        'UBER','NETFLIX','SPOTIFY','GOOGLE','APPLE','AMAZON','DISNEY','MICROSOFT',
        'STARBUCKS','MCDONALDS','DOMINOS','CINNABON','KFC','SUBWAY',
        'SUPER','XTRA','METRO','NOVEY','FARMACIA','CLINICA','HOSPITAL',
        'FITLAB','SMARTFIT','GYMPASS',
        'TEXACO','DELTA','SHELL','ESSO',
        'TIGO','CABLE','ENSA','NATURGY','IDAAN',
        'PLANILLA','SALARIO','COMISION','ITBMS','SEGURO','PRESTAMO',
        'EPIKCREDITO','PREMIERGENERAL','COMPASS',
        'RAENCO','RECARGA','TRANSPORTE','PEDIDOSYA','PEDIDOS',
        'PANATICKETS','ALBROOK','MULTIPLAZA','PACIFIC','CENTER',
    }

    def _is_global_keyword(self, word: str) -> bool:
        return word in self.GLOBAL_KEYWORDS

    def _learn_single(self, detail: str, categories: dict, weight: float = 1.0,
                      force_personal: bool = False):
        """
        Aprende un ejemplo. Decide si va al KB global o personal:
        - Si el detalle contiene palabras de GLOBAL_KEYWORDS: KB global
        - Si contiene nombres (contactos): KB personal
        - force_personal=True: siempre personal (reclasificaciones manuales personales)
        """
        words = re.findall(r'\b[A-Z]{3,}\b', detail)
        # Excluir tokens del nombre del usuario de los patrones
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        # Decidir destino
        has_global_word = any(self._is_global_keyword(w) for w in words)
        target = self.global_rules if (has_global_word and not force_personal) else self.personal_rules
        target_label = "global" if target is self.global_rules else "personal"

        # Exact match
        target['exact_matches'][detail] = categories

        # Word weights
        for word in words:
            for campo, valor in categories.items():
                target['word_weights'][word][f"{campo}={valor}"] += weight

        # Patrón (solo para palabras específicas, no ambiguas)
        self._create_pattern(detail, categories, target, target_label)
        target['corrections_count'] += 1

    def _create_pattern(self, detail: str, categories: dict, rules: dict, label: str):
        """Crea patrones solo con keywords específicas. Excluye palabras ambiguas."""
        # Palabras que por sí solas no dicen nada sobre la categoría
        AMBIGUOUS = {
            'TRANSFERENCIA','PAGO','DE','LA','EL','POR','BG','A','AL',
            'BANCA','BANCO','MOVIL','TRANSF','INTL','LOCAL','DEBITO','CREDITO',
            'CUENTAS','ENTRE','XPRESS','GENERAL','YAPPY','PAGOYAPPY',
            'COMPRA','COMMERCE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO',
            'FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO',
            'SEPTIEMBRE','TARJETA','PARA','MORA','DEBITADO','TRAN',
        }
        words = [w for w in re.findall(r'\b[A-Z]{4,}\b', detail)
                 if w not in AMBIGUOUS]
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        for word in words[:3]:
            pat_name = f"{label}_{categories.get('Economic Type','x')}_{word}"
            if pat_name not in rules['patterns']:
                rules['patterns'][pat_name] = {
                    'regex':      r'\b' + re.escape(word) + r'\b',
                    'categories': categories,
                    'source':     'learned'
                }

    def learn_from_corrections(self, corrections_file: str) -> int:
        """Aprende de PARA_REVISAR.xlsx (baja confianza)."""
        df     = pd.read_excel(corrections_file)
        campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
                  'Categoría de presupuesto', 'budget_role']
        learned = 0

        for _, row in df.iterrows():
            categories, has_correction = {}, False
            for campo in campos:
                corrected_val = row.get(f"{campo}_corrected") if f"{campo}_corrected" in df.columns else None
                original_val  = row.get(campo)
                if pd.notna(corrected_val) and str(corrected_val) != str(original_val):
                    categories[campo] = corrected_val
                    has_correction = True
                elif pd.notna(original_val):
                    categories[campo] = original_val
            if row.get('manual_review') is True:
                has_correction = True

            if has_correction and categories:
                detail = str(row['Detalle']).strip().upper()
                self._learn_single(detail, categories, weight=1.0)
                learned += 1

        self._save_kb(self.global_kb_path,  self.global_rules,   "global")
        self._save_kb(self.user_kb_path,    self.personal_rules, "personal")
        print(f"🎓 Aprendidas {learned} correcciones nuevas")
        return learned

    # ── Flujo de reclasificación ──────────────────────────────────────────────

    def save_all(self):
        self._save_kb(self.global_kb_path,  self.global_rules,   "global")
        self._save_kb(self.user_kb_path,    self.personal_rules, "personal")


# ── Herramienta de migración (ejecutar una sola vez) ─────────────────────────

def migrate_existing_kb(old_kb_path: str,
                        new_global_path: str = DEFAULT_GLOBAL_KB,
                        user_name: str = "Alexis Pineda",
                        user_id:   str = None):
    """
    Divide tu knowledge_base.json actual en global + personal.

    Criterio de división:
    - Exact matches con keywords de GLOBAL_KEYWORDS: global
    - Todo lo demas (nombres de contactos, IDs personales): personal
    - Patrones con palabras ambiguas (BANCA, TRANSF, YAPPY solo, INTL...): eliminados
      porque generaban 58 conflictos; el motor builtin + exact_matches los cubren mejor.

    Ejecutar UNA SOLA VEZ al migrar de v4 a v5.
    """
    if not Path(old_kb_path).exists():
        print(f"❌ No se encontró {old_kb_path}")
        return

    safe   = re.sub(r'[^a-z0-9]', '_', user_name.lower().strip()) if not user_id else user_id
    user_kb_path = DEFAULT_USER_KB.format(safe)

    with open(old_kb_path, 'r', encoding='utf-8') as f:
        old = json.load(f)

    clf = FinancialClassifier(
        global_kb_path=new_global_path,
        user_kb_path=user_kb_path,
        user_name=user_name,
        user_id=user_id
    )

    GLOBAL_KEYWORDS = FinancialClassifier.GLOBAL_KEYWORDS
    AMBIGUOUS_PATTERN_WORDS = {
        'BANCA','BANCO','MOVIL','TRANSF','INTL','LOCAL','DEBITO','CREDITO',
        'CUENTAS','ENTRE','XPRESS','GENERAL','YAPPY','PAGOYAPPY',
        'COMPRA','COMMERCE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO',
        'FEBRERO','MARZO','TARJETA','PARA','MORA','DEBITADO','TRAN',
        'BANCO','PEDRO','MOVIL'
    }

    exact_global, exact_personal = 0, 0
    for detail, cats in old.get('exact_matches', {}).items():
        words = set(re.findall(r'\b[A-Z]{3,}\b', detail.upper()))
        if words & GLOBAL_KEYWORDS:
            clf.global_rules['exact_matches'][detail] = cats
            exact_global += 1
        else:
            clf.personal_rules['exact_matches'][detail] = cats
            exact_personal += 1

    pat_global, pat_personal, pat_removed = 0, 0, 0
    for name, pat in old.get('patterns', {}).items():
        word = pat['regex'].replace(r'\b', '')
        if word in AMBIGUOUS_PATTERN_WORDS:
            pat_removed += 1
            continue  # descartar — generaban conflictos
        if word in GLOBAL_KEYWORDS:
            clf.global_rules['patterns'][name] = pat
            pat_global += 1
        else:
            clf.personal_rules['patterns'][name] = pat
            pat_personal += 1

    # Word weights: misma lógica
    for word, cats in old.get('word_weights', {}).items():
        if word in GLOBAL_KEYWORDS:
            for cat, weight in cats.items():
                clf.global_rules['word_weights'][word][cat] = weight
        else:
            for cat, weight in cats.items():
                clf.personal_rules['word_weights'][word][cat] = weight

    clf.global_rules['corrections_count']   = exact_global
    clf.personal_rules['corrections_count'] = exact_personal

    clf.save_all()

    print(f"\n✅ Migración completada:")
    print(f"   KB Global   → {new_global_path}")
    print(f"     exact_matches : {exact_global}  |  patterns : {pat_global}")
    print(f"   KB Personal → {user_kb_path}")
    print(f"     exact_matches : {exact_personal}  |  patterns : {pat_personal}")
    print(f"   Patrones ambiguos eliminados: {pat_removed}")
    print(f"\n   Los patrones eliminados eran palabras sueltas (BANCA, TRANSF, YAPPY…)")
    print(f"   que generaban 58 conflictos. El motor builtin y los exact_matches")
    print(f"   los cubren con mucha más precisión.")


# ── Flujos de trabajo ─────────────────────────────────────────────────────────

def main_workflow(user_name: str = "Alexis Pineda", user_id: str = None,
                  input_file: str = None, output_dir: str = None):

    out = output_dir or "C:/Users/Alexis Pineda/Downloads/ANALITICA DE TRANSACCIONES"
    inp = input_file or f"{out}/Movimientos consolidados de Alexis Pineda.xlsx"

    print(f"👤 Usuario: {user_name}")
    clf = FinancialClassifier(user_name=user_name, user_id=user_id)

    df = pd.read_excel(inp)
    if str(df.iloc[0].get('DIA ', '')) == 'DIA ':
        df = df.iloc[1:].reset_index(drop=True)

    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']

    for idx in df[df[campos].isna().all(axis=1)].index:
        cats, conf, method = clf.predict(df.loc[idx])
        if cats:
            for c, v in cats.items():
                df.loc[idx, c] = v
            df.loc[idx, 'confidence'] = conf
            df.loc[idx, 'method']     = method

    if 'reclasificar' not in df.columns:
        df['reclasificar'] = False
    if 'nota_reclasificacion' not in df.columns:
        df['nota_reclasificacion'] = ''

    # PARA_REVISAR (baja confianza o sin clasificar)
    if 'confidence' in df.columns:
        mask = (df['confidence'] < 0.6) | df['confidence'].isna()
        baja = df[mask].copy()
    else:
        baja = pd.DataFrame()

    if len(baja) > 0:
        for campo in campos:
            baja[f"{campo}_corrected"] = baja[campo]
        baja['manual_review'] = False
        baja['notas'] = ''
        baja.to_excel(f"{out}/PARA_REVISAR.xlsx", index=False)
        print(f"📝 {len(baja)} filas en PARA_REVISAR.xlsx para revisión")

    df.to_excel(f"{out}/RESULTADO_CLASIFICADO.xlsx", index=False)
    print(f"✅ Resultado guardado en RESULTADO_CLASIFICADO.xlsx")
    print(f"💡 Marca True en 'reclasificar' para corregir errores → python script.py reclasify")
    return clf


def apply_learning(user_name: str = "Alexis Pineda", user_id: str = None,
                   output_dir: str = None):
    out = output_dir or "C:/Users/Alexis Pineda/Downloads/ANALITICA DE TRANSACCIONES"
    clf = FinancialClassifier(user_name=user_name, user_id=user_id)
    path = f"{out}/PARA_REVISAR.xlsx"
    if not Path(path).exists():
        print(f"❌ No se encontró {path}")
        return
    nuevas = clf.learn_from_corrections(path)
    print(f"\n✅ Modelo actualizado con {nuevas} correcciones")


def prepare_reclassification(user_name: str = "Alexis Pineda", user_id: str = None,
                              output_dir: str = None):
    out = output_dir or "C:/Users/Alexis Pineda/Downloads/ANALITICA DE TRANSACCIONES"
    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']
    resultado_path = f"{out}/RESULTADO_CLASIFICADO.xlsx"
    salida_path    = f"{out}/PARA_RECLASIFICAR.xlsx"

    if not Path(resultado_path).exists():
        print(f"❌ No se encontró {resultado_path}")
        return

    df = pd.read_excel(resultado_path)
    if 'reclasificar' not in df.columns:
        print("⚠️  El archivo no tiene la columna 'reclasificar'. Regenera con python script.py")
        return

    df['reclasificar'] = df['reclasificar'].astype(str).str.strip().str.lower()
    marcadas = df[df['reclasificar'].isin(['true','1','si','yes','sí'])].copy()

    if len(marcadas) == 0:
        print("ℹ️  No hay filas marcadas. Pon True en la columna 'reclasificar' y guarda el archivo.")
        return

    for campo in campos:
        marcadas[f"{campo}_corrected"] = marcadas[campo]
    marcadas['manual_review'] = True
    marcadas.to_excel(salida_path, index=False)
    print(f"\n✏️  {len(marcadas)} filas → PARA_RECLASIFICAR.xlsx")
    print("   Edita las columnas *_corrected y ejecuta: python script.py reclasify_learn")


def apply_reclassification_learning(user_name: str = "Alexis Pineda", user_id: str = None,
                                     output_dir: str = None):
    out = output_dir or "C:/Users/Alexis Pineda/Downloads"
    clf = FinancialClassifier(user_name=user_name, user_id=user_id)
    reclasif_path  = f"{out}/PARA_RECLASIFICAR.xlsx"
    resultado_path = f"{out}/RESULTADO_CLASIFICADO.xlsx"
    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción',
              'Categoría de presupuesto', 'budget_role']

    if not Path(reclasif_path).exists():
        print(f"❌ No se encontró {reclasif_path}. Ejecuta primero: python script.py reclasify")
        return

    df_reclas = pd.read_excel(reclasif_path)
    df_result = pd.read_excel(resultado_path)

    aprendidas, actualizadas = 0, 0

    for _, row in df_reclas.iterrows():
        categories, has_change = {}, False
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

        if has_change:
            # Las reclasificaciones explícitas del usuario son siempre personales
            # (él sabe mejor que nadie cómo clasificar sus propias transacciones)
            clf._learn_single(detail, categories, weight=2.0, force_personal=True)
            aprendidas += 1

        mask = df_result['Detalle'].str.strip().str.upper() == detail
        if mask.any():
            for campo, valor in categories.items():
                df_result.loc[mask, campo] = valor
            df_result.loc[mask, 'confidence']         = 1.0
            df_result.loc[mask, 'method']             = 'reclassified_by_user'
            df_result.loc[mask, 'reclasificar']       = False
            actualizadas += int(mask.sum())

    clf.save_all()
    df_result.to_excel(resultado_path, index=False)
    print(f"\n✅ {aprendidas} patrones nuevos aprendidos")
    print(f"✅ {actualizadas} filas actualizadas en RESULTADO_CLASIFICADO.xlsx")


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # ── ¿Cómo obtener el nombre del usuario en tu app? ──────────────────────
    # OPCIÓN A — Variable de entorno (recomendado producción):
    #   APP_USER_NAME="María González" APP_USER_ID="u_42" python script.py
    #   → USER_NAME = os.environ.get("APP_USER_NAME", "Alexis Pineda")
    #   → USER_ID   = os.environ.get("APP_USER_ID",   None)
    #
    # OPCIÓN B — Flask / FastAPI / Django:
    #   Flask:   USER_NAME = current_user.full_name ; USER_ID = str(current_user.id)
    #   FastAPI: USER_NAME = current_user.full_name (inyectado con Depends)
    #   Django:  USER_NAME = request.user.get_full_name()
    #
    # OPCIÓN C — Línea de comandos (pruebas):
    #   python script.py run "María González" u_42
    USER_NAME = os.environ.get("APP_USER_NAME", "Alexis Pineda")
    USER_ID   = os.environ.get("APP_USER_ID",   None)

    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"

    if cmd == "migrate":
        # Ejecutar UNA SOLA VEZ para dividir el KB viejo en global + personal
        old = sys.argv[2] if len(sys.argv) > 2 else "knowledge_base.json"
        migrate_existing_kb(old, user_name=USER_NAME, user_id=USER_ID)

    elif cmd == "learn":
        apply_learning(user_name=USER_NAME, user_id=USER_ID)

    elif cmd == "reclasify":
        prepare_reclassification(user_name=USER_NAME, user_id=USER_ID)

    elif cmd == "reclasify_learn":
        apply_reclassification_learning(user_name=USER_NAME, user_id=USER_ID)

    else:
        main_workflow(user_name=USER_NAME, user_id=USER_ID)
        print("\n" + "=" * 55)
        print("COMANDOS DISPONIBLES:")
        print()
        print("  python script.py")
        print("    → Clasificar nuevas transacciones")
        print()
        print("  python script.py migrate knowledge_base.json")
        print("    → (Una sola vez) dividir KB viejo en global + personal")
        print()
        print("  python script.py learn")
        print("    → Aprender de PARA_REVISAR.xlsx")
        print()
        print("  python script.py reclasify")
        print("    → Exportar filas marcadas a PARA_RECLASIFICAR.xlsx")
        print()
        print("  python script.py reclasify_learn")
        print("    → Aprender de PARA_RECLASIFICAR y actualizar RESULTADO")
        print("=" * 55)
