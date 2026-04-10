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
    failed_dir: str = "storage/failed"   # Archivos que fallaron — preservados para diagnóstico admin

    # Límites de upload por usuario (anti-abuso)
    max_uploads_free: int = 5        # plan "free" — alineado con el límite de 3 análisis
    max_uploads_default: int = 200   # plan "pro" / "friends_and_family" — tope de seguridad

    # Celery / Redis
    redis_url: str = "redis://localhost:6379/0"

    # Email (Resend) — requerido en producción (DEBUG=false)
    resend_api_key: str = ""
    email_from: str = "SAFPRO <noreply@tudominio.com>"
    frontend_url: str = "http://localhost:3000"   # base URL del frontend (sin barra al final)
    backend_url: str = "http://localhost:8001"    # base URL del backend (para callbacks OAuth, sin barra al final)

    @property
    def frontend_base(self) -> str:
        """frontend_url siempre sin barra al final."""
        return self.frontend_url.rstrip("/")

    @property
    def backend_base(self) -> str:
        """backend_url siempre sin barra al final."""
        return self.backend_url.rstrip("/")

    # OAuth — Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # OAuth — GitHub
    github_client_id: str = ""
    github_client_secret: str = ""

    # ── PayPal — pagos y suscripciones (Plan A si dLocal Go no está disponible) ─
    # 1. Crea una cuenta Business en paypal.com/business
    # 2. Ve a developer.paypal.com → My Apps → Create App → copia Client ID y Secret
    # 3. Ejecuta scripts/setup_paypal_plans.py para crear los planes
    # 4. Configura el webhook en developer.paypal.com → Webhooks → copia el Webhook ID
    paypal_client_id: str = ""              # Client ID de la app PayPal
    paypal_client_secret: str = ""          # Client Secret de la app PayPal
    paypal_sandbox: bool = True             # True = api-m.sandbox.paypal.com
    paypal_plan_id_monthly: str = ""        # ID del plan mensual ($6.50 USD/mes)
    paypal_plan_id_annual: str = ""         # ID del plan anual  ($56.00 USD/año)
    paypal_webhook_id: str = ""             # ID del webhook (para verificación de firma)

    # ── dLocal Go — pagos y suscripciones ──────────────────────────────────────
    # Obtén las keys en: https://merchant.dlocalgo.com → Developers → API Keys
    dlocalgo_api_key: str = ""               # API key del merchant
    dlocalgo_secret_key: str = ""            # Secret key del merchant
    dlocalgo_sandbox: bool = True            # True = usa api-sbx.dlocalgo.com
    dlocalgo_plan_id_monthly: str = ""       # ID del plan mensual ($5 USD/mes)
    dlocalgo_plan_id_annual: str = ""        # ID del plan anual  ($45 USD/año)

    # ── Stripe — LEGACY (no usar para nuevos pagos) ─────────────────────────
    # Mantener en .env para no romper users existentes con stripe_customer_id en DB
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_monthly: str = ""
    stripe_price_id_annual: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        #extra="ignore",
    )


settings = Settings()