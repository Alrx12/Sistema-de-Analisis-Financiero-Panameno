"""
Rate limiter para SAFPRO — usa slowapi sobre Redis en producción.

Comportamiento según el entorno:
  - DEBUG=true  (dev/tests) → limiter deshabilitado. Los tests no se ven afectados
                               y no hace falta Redis para desarrollar.
  - DEBUG=false (producción) → limiter activo. Usa Redis como backend para que
                               los contadores persistan entre reinicios del servidor.

Límites aplicados:
  - POST /auth/login          → 10 intentos / minuto / IP
  - POST /auth/forgot-password → 5  intentos / minuto / IP
  - POST /auth/register        → 10 intentos / minuto / IP

Por qué importan:
  - /login: sin límite, un atacante puede probar miles de contraseñas por segundo.
  - /forgot-password: sin límite, se puede usar para spamear emails a cualquier dirección.
  - /register: sin límite, se pueden crear miles de cuentas basura en segundos.

Uso en endpoints:
    from fastapi import Request
    from app.core.limiter import limiter

    @router.post("/login")
    @limiter.limit("10/minute")
    def login(request: Request, ...):
        ...

El parámetro `request: Request` es obligatorio para que slowapi pueda extraer la IP.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# En producción (DEBUG=false) usa Redis para que los contadores
# sobrevivan reinicios y sean compartidos entre procesos/workers.
# En desarrollo usa memoria — sin dependencia de Redis para los tests.
_storage_uri = settings.redis_url if not settings.debug else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    enabled=not settings.debug,
    storage_uri=_storage_uri,
    default_limits=[],  # Sin límite global — cada endpoint define el suyo
)
