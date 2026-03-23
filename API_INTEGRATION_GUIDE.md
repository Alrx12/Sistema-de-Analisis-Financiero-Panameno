
# GUÍA DE INTEGRACIÓN PARA FASTAPI

## Problema Identificado

Cuando usas `UploadFile` en FastAPI, el archivo se maneja como un `SpooledTemporaryFile`. 
El problema es que:
1. Si lees el archivo con `await file.read()`, el puntero se mueve al final
2. Si no haces `await file.seek(0)` antes de pasarlo a pandas, pandas leerá vacío
3. Los parsers necesitan recibir el objeto file-like, no los bytes leídos

## Solución para el Endpoint de FastAPI

### Opción 1: Usar file.file directamente (Recomendada)

```python
from fastapi import FastAPI, File, UploadFile, HTTPException
from app.parsers.factory import ParserFactory
import pandas as pd

app = FastAPI()

@app.post("/api/v1/files/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Endpoint para subir archivos bancarios.
    Acepta archivos Excel (.xlsx, .xls) y CSV (.csv)
    """
    try:
        # Validar extensión
        allowed_extensions = {'.csv', '.xls', '.xlsx'}
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Archivo inválido")

        # IMPORTANTE: No leer el archivo con await file.read() antes de pasarlo al parser
        # El parser necesita el objeto file-like para poder leerlo con pandas

        # El objeto file.file es un SpooledTemporaryFile que pandas puede leer directamente
        # PERO debemos asegurarnos de que esté al inicio (seek 0)
        await file.seek(0)  # Asegurar que estamos al inicio del archivo

        # Obtener el parser adecuado
        # Pasamos el objeto file-like con el atributo filename
        file.file.filename = file.filename  # Agregar atributo filename para el parser
        parser = ParserFactory.get_parser(file.file)

        # Volver al inicio para parsear
        await file.seek(0)
        file.file.filename = file.filename

        # Parsear el archivo
        result = parser.parse(file.file)

        return {
            "status": "done",
            "analysis": {
                "total_transactions": len(result["transactions"]),
                "account_last4": result["detected_account_last4"],
                # ... otros datos
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await file.close()
```

### Opción 2: Usar BytesIO (Alternativa)

```python
from fastapi import FastAPI, File, UploadFile, HTTPException
from app.parsers.factory import ParserFactory
from io import BytesIO

@app.post("/api/v1/files/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Leer contenido
        contents = await file.read()

        # Crear BytesIO
        bytesio = BytesIO(contents)
        bytesio.filename = file.filename  # Agregar atributo para el parser

        # Obtener parser y parsear
        parser = ParserFactory.get_parser(bytesio)

        # Resetear BytesIO para parsear de nuevo
        bytesio.seek(0)
        result = parser.parse(bytesio)

        return {
            "status": "done",
            "analysis": {
                "total_transactions": len(result["transactions"]),
                "account_last4": result["detected_account_last4"],
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### Opción 3: Guardar archivo temporal (Más segura)

```python
import tempfile
import os
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from app.parsers.factory import ParserFactory

@app.post("/api/v1/files/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Crear archivo temporal
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            # Escribir contenido
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Parsear usando la ruta del archivo temporal
        parser = ParserFactory.get_parser(tmp_path)
        result = parser.parse(tmp_path)

        # Limpiar archivo temporal
        os.unlink(tmp_path)

        return {
            "status": "done",
            "analysis": {
                "total_transactions": len(result["transactions"]),
                "account_last4": result["detected_account_last4"],
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await file.close()
```

## Cambios Necesarios en los Parsers

Los parsers han sido actualizados para soportar tanto rutas de archivo como objetos file-like:

1. `load_dataframe()` ahora detecta si recibe un `BytesIO` o una ruta
2. `detect_score()` y `parse()` aceptan `Union[str, BytesIO]`
3. Se agregó manejo del atributo `filename` para obtener el nombre del archivo

## Verificación

Para verificar que todo funciona, prueba con curl:

```bash
curl -X POST "http://localhost:8000/api/v1/files/upload" \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "file=@/ruta/a/ULTIMOS-MOVIMIENTOS-CUENTA-DE-AHORROS-2026-03-17.xlsx"
```

## Errores Comunes

1. **"No se pudieron extraer transacciones validas del archivo"**
   - El archivo no está siendo leído correctamente
   - Verificar que se hace `seek(0)` antes de pasar al parser
   - Verificar que el atributo `filename` está presente

2. **Score de detección bajo (0.0)**
   - El archivo no se está leyendo (vacío)
   - Verificar que no se leyó previamente sin hacer seek(0)

3. **"Extension de archivo no soportada"**
   - El archivo no tiene extensión o es diferente
   - Verificar que `file.filename` tiene la extensión correcta
