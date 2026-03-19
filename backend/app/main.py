from fastapi import FastAPI
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import engine

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def test_db_connection():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        print("DB conectada correctamente")