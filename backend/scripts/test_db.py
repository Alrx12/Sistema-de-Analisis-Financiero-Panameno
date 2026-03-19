from sqlalchemy import create_engine, text
from app.core.config import settings

print("DATABASE_URL:", settings.database_url)

engine = create_engine(settings.database_url, future=True)

with engine.connect() as conn:
    result = conn.execute(text("SELECT current_database(), current_user"))
    print(result.fetchone())