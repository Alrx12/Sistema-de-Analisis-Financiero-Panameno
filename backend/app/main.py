from contextlib import asynccontextmanager

from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.limiter import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        print("DB conectada correctamente")
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(api_router, prefix=settings.api_v1_prefix)
