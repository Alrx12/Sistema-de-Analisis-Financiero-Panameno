from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SAFPRO API"
    app_version: str = "0.1.0"
    debug: bool = True

    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://apineda:InsightLex@100.88.92.80:5432/safpro"

    secret_key: str = "9f4d7a2c8e1b5f0a3d6c9b2e7f1a4c8d9e2b6f0a1c3d5e7f9b2a4c6d8e1f3a5"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    upload_dir: str = "storage/uploads"
    processed_dir: str = "storage/processed"
    temp_dir: str = "storage/temp"
    knowledge_bases_dir: str = "storage/knowledge_bases"

    # Celery / Redis
    redis_url: str = "redis://localhost:6379/0"

    # Email (Resend) — requerido en producción (DEBUG=false)
    resend_api_key: str = ""
    email_from: str = "SAFPRO <noreply@tudominio.com>"
    frontend_url: str = "http://localhost:3000"  # base URL del frontend para el link de reset

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        #extra="ignore",
    )


settings = Settings()