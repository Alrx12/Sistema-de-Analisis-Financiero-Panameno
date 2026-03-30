"""
Configuración global de pytest para todos los tests de SAFPRO.

Por qué existe este archivo:
    El rate limiter (slowapi) se inicializa como singleton al importar el módulo.
    Si el entorno tiene DEBUG=false (producción o CI), el limiter queda habilitado
    y los tests de integración que hacen múltiples POST /register en la misma sesión
    acumulan hits hasta superar el límite (10/minuto), causando 429 en tests posteriores.

    Este conftest desactiva el limiter para toda la sesión de tests, independientemente
    del valor de DEBUG en .env. El comportamiento del limiter en producción se testea
    por separado si se necesita.
"""
import pytest

from app.core.limiter import limiter


@pytest.fixture(autouse=True, scope="session")
def disable_rate_limiter_for_tests():
    """Desactiva el rate limiter durante toda la sesión de tests."""
    original_enabled = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original_enabled
