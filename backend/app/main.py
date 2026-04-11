import logging
from contextlib import asynccontextmanager
from contextvars import Token
from typing import Optional

import jwt
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from app.core.request_context import current_user_id_var

# ── Logging (primero de todo) ─────────────────────────────────────────────────
setup_logging()
logger = logging.getLogger(__name__)


# ── Sentry — inicializar ANTES de crear la app ────────────────────────────────
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            CeleryIntegration(monitor_beat_tasks=False),
        ],
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
        environment="development" if settings.debug else "production",
        # Nunca enviar datos personales del usuario a Sentry
        send_default_pii=False,
        # Excluir rutas de health-check del tracing
        traces_sampler=lambda ctx: (
            0.0
            if ctx.get("wsgi_environ", {}).get("PATH_INFO", "").startswith(
                "/api/v1/health"
            )
            else settings.sentry_traces_sample_rate
        ),
    )
    logger.info("Sentry inicializado (env=%s)", "development" if settings.debug else "production")
else:
    logger.info("SENTRY_DSN no configurado — Sentry desactivado")


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        logger.info(
            "DB conectada correctamente — SAFPRO v%s arrancando", settings.app_version
        )
    yield
    logger.info("SAFPRO apagándose.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
    # Deshabilitar docs en producción
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)


# ── CORS ──────────────────────────────────────────────────────────────────────
# Solo acepta requests del frontend de SAFPRO.
# En debug también permite localhost:3000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,               # necesario para enviar cookies/auth
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,                           # preflight cache 10 min
)


# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Middleware: RLS context ───────────────────────────────────────────────────
# Extrae el user_id del JWT y lo almacena en un ContextVar para que el
# event listener de SQLAlchemy lo inyecte en la sesión de DB (set_config RLS).
@app.middleware("http")
async def rls_context_middleware(request: Request, call_next: object) -> Response:
    """Lee el JWT del header Authorization y pone el user_id en el ContextVar."""
    token_var: Optional[Token] = None
    auth_header = request.headers.get("Authorization", "")

    if auth_header.startswith("Bearer "):
        raw_token = auth_header.removeprefix("Bearer ").strip()
        if raw_token:
            try:
                payload = jwt.decode(
                    raw_token,
                    settings.secret_key,
                    algorithms=[settings.algorithm],
                    options={"verify_exp": True},
                )
                user_id = payload.get("sub")
                if user_id:
                    token_var = current_user_id_var.set(str(user_id))
            except jwt.PyJWTError:
                pass  # Token inválido → sin contexto de usuario (correcto)

    try:
        response = await call_next(request)  # type: ignore[operator]
    finally:
        # Limpiar el ContextVar al final del request (buena práctica)
        if token_var is not None:
            current_user_id_var.reset(token_var)

    return response


# ── Middleware: Security Headers adicionales en respuestas de API ─────────────
# Nginx ya maneja los headers para el frontend estático.
# Este middleware los añade también a las respuestas del backend /api/*.
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next: object) -> Response:
    """Añade security headers a todas las respuestas de la API."""
    response: Response = await call_next(request)  # type: ignore[operator]

    # Solo para respuestas de la API (nginx ya cubre el frontend)
    if request.url.path.startswith("/api/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Quitar X-Powered-By / Server headers que revelan stack
        response.headers.pop("server", None)
        response.headers.pop("x-powered-by", None)

    return response


# ── Router ───────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.api_v1_prefix)
