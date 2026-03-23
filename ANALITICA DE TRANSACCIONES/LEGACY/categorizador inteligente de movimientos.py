import pandas as pd
import re
import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime

class FinancialClassifier:
    def __init__(self, knowledge_base_path="knowledge_base.json"):
        self.knowledge_base_path = knowledge_base_path
        self.rules = {
            'exact_matches': {},      # Detalle exacto → categorías
            'patterns': {},           # Regex → categorías  
            'word_weights': defaultdict(lambda: defaultdict(float)),
            'corrections_count': 0
        }
        self.load_knowledge()
    
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
    
    def predict(self, row):
        detail = str(row.get('Detalle', '')).strip().upper()
        
        # 1. Match exacto
        if detail in self.rules['exact_matches']:
            return self.rules['exact_matches'][detail], 1.0, "exact"
        
        # 2. Patrones regex
        for name, pat in self.rules['patterns'].items():
            if re.search(pat['regex'], detail):
                return pat['categories'], 0.9, f"pattern:{name}"
        
        # 3. Fallback por tipo
        tipo = str(row.get('Tipos de Movimientos', '')).upper()
        if 'DEBIT' in tipo or row.get('Retiro', 0) > 0:
            return {
                'Economic Type': 'gasto', 'SubType Economic': 'desconocido',
                'Tipo de transacción': 'gasto', 'Categoría de presupuesto': 'consumo_desconocido',
                'budget_role': 'revisar'
            }, 0.3, "fallback"
        
        return None, 0.0, "unknown"
    
    def learn_from_corrections(self, corrections_file):
        """
        APRENDE de tu archivo de correcciones
        """
        df = pd.read_excel(corrections_file)
        campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción', 
                 'Categoría de presupuesto', 'budget_role']
        
        learned = 0
        
        for _, row in df.iterrows():
            # Detecta si usaste columnas _corrected o editaste directo
            categories = {}
            has_correction = False
            
            for campo in campos:
                corrected_val = row.get(f"{campo}_corrected") if f"{campo}_corrected" in df.columns else None
                original_val = row.get(campo)
                
                # Usa el corregido si existe y es diferente, sino el original
                if pd.notna(corrected_val) and corrected_val != original_val:
                    categories[campo] = corrected_val
                    has_correction = True
                elif pd.notna(original_val):
                    categories[campo] = original_val
            
            # También revisa flag manual_review
            if row.get('manual_review') == True:
                has_correction = True
            
            if has_correction and categories:
                detail = str(row['Detalle']).strip().upper()
                
                # Guarda ejemplo exacto
                self.rules['exact_matches'][detail] = categories
                
                # Aprende palabras clave
                words = re.findall(r'\b[A-Z]{3,}\b', detail)
                for word in words:
                    for campo, valor in categories.items():
                        key = f"{campo}={valor}"
                        self.rules['word_weights'][word][key] += 1.0
                
                # Crea patrón si es útil
                self._create_pattern(detail, categories)
                
                learned += 1
                self.rules['corrections_count'] += 1
        
        print(f"🎓 Aprendidas {learned} correcciones nuevas")
        self.save_knowledge()
        return learned
    
    def _create_pattern(self, detail, categories):
        """Extrae patrones automáticamente de correcciones"""
        # Busca palabras distintivas (no comunes)
        common = {'TRANSFERENCIA', 'PAGO', 'DE', 'LA', 'EL', 'POR', 'BG', 'A'}
        words = [w for w in re.findall(r'\b[A-Z]{4,}\b', detail) if w not in common]
        
        for word in words[:3]:  # Top 3 palabras
            pat_name = f"{categories['Economic Type']}_{word}"
            if pat_name not in self.rules['patterns']:
                self.rules['patterns'][pat_name] = {
                    'regex': r'\b' + re.escape(word) + r'\b',
                    'categories': categories,
                    'source': 'learned'
                }


def main_workflow():
    """Flujo completo de trabajo"""
    
    # 1. Inicializar
    clf = FinancialClassifier()
    
    # 2. Procesar datos nuevos
    input_file = "C:/Users/Alexis Pineda/Downloads/Movimientos consolidados de Alexis Pineda.xlsx"
    df = pd.read_excel(input_file)
    
    # Limpiar si hay header duplicado
    if str(df.iloc[0].get('DIA ', '')) == 'DIA ':
        df = df.iloc[1:].reset_index(drop=True)
    
    campos = ['Economic Type', 'SubType Economic', 'Tipo de transacción', 
              'Categoría de presupuesto', 'budget_role']
    
    # Clasificar vacíos
    for idx in df[df[campos].isna().all(axis=1)].index:
        cats, conf, method = clf.predict(df.loc[idx])
        if cats:
            for c, v in cats.items():
                df.loc[idx, c] = v
            df.loc[idx, 'confidence'] = conf
            df.loc[idx, 'method'] = method
    
    # 3. Separar los de baja confianza para revisión
    baja_confianza = df[df['confidence'] < 0.6].copy() if 'confidence' in df.columns else pd.DataFrame()
    
    if len(baja_confianza) > 0:
        # Crear columnas para corrección
        for campo in campos:
            baja_confianza[f"{campo}_corrected"] = baja_confianza[campo]
        baja_confianza['manual_review'] = False
        baja_confianza['notas'] = ''
        
        baja_confianza.to_excel("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx", index=False)
        print(f"📝 {len(baja_confianza)} filas en PARA_REVISAR.xlsx para tu revisión")
    
    # 4. Guardar resultado completo
    df.to_excel("C:/Users/Alexis Pineda/Downloads/RESULTADO_CLASIFICADO.xlsx", index=False)
    print(f"✅ Resultado guardado en C:/Users/Alexis Pineda/Downloads/RESULTADO_CLASIFICADO.xlsx")
    
    return clf


def apply_learning():
    """Ejecuta ESTO después de que corrijas PARA_REVISAR.xlsx"""
    clf = FinancialClassifier()
    
    # Verifica que existe el archivo de correcciones
    if not Path("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx").exists():
        print("❌ No se encontró PARA_REVISAR.xlsx")
        return
    
    print("\n" + "="*50)
    print("MODO APRENDIZAJE")
    print("="*50)
    print("Asegúrate de haber:")
    print("1. Editado las columnas *_corrected")
    print("2. Marcado manual_review = True donde corregiste")
    print("="*50)
    
    # Aprende
    nuevas = clf.learn_from_corrections("C:/Users/Alexis Pineda/Downloads/PARA_REVISAR.xlsx")
    
    print(f"\n✅ Modelo actualizado con {nuevas} correcciones")
    print("La próxima ejecución clasificará mejor!")


# EJECUCIÓN
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "learn":
        # Modo aprendizaje: python script.py learn
        apply_learning()
    else:
        # Modo normal: clasificación
        main_workflow()
        print("\n" + "="*50)
        print("PRÓXIMO PASO:")
        print("1. Abre PARA_REVISAR.xlsx")
        print("2. Corrige las columnas *_corrected")
        print("3. Marca manual_review = True")
        print("4. Guarda el archivo")
        print("5. Ejecuta: python script.py learn")
        print("="*50)