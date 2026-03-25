"""
Servicio de huella digital de archivos.

Calcula el checksum SHA-256 del contenido de un archivo.
Se usa para detectar uploads duplicados antes de encolar el trabajo de Celery.

Por qué SHA-256 sobre los bytes del archivo:
  - Los exports bancarios (BG, BAC, Banistmo) son deterministas para el mismo período:
    si el usuario descarga el mismo archivo dos veces, los bytes son idénticos.
  - Es O(n) sobre el tamaño del archivo y se calcula antes de encolar → sin overhead de Celery.
  - Si un banco embutiera un timestamp en los metadatos del Excel (haciendo el hash diferente
    para el mismo contenido), se puede extender a un hash del contenido parseado.
"""
from __future__ import annotations

import hashlib


def compute_checksum(content: bytes) -> str:
    """
    Calcula el SHA-256 hexadecimal del contenido de un archivo.

    Args:
        content: Bytes del archivo leído.

    Returns:
        String hexadecimal de 64 caracteres (SHA-256).
    """
    return hashlib.sha256(content).hexdigest()
