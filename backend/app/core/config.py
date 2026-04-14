from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Valores placeholder/ejemplo que NUNCA deben usarse en producción.
# Si alguno de estos llega a producción, la app falla en startup (ver validate_production_secrets).
_INSECURE_SECRET_EXAMPLES = {
    "",
    "CHANGE-THIS-IN-PRODUCTION",
    "clave_segura_larga",
}


class Settings(BaseSettings):
    app_name: str = "SAFPRO API"
    app_version: str = "0.1.0"
    debug: bool = False

    api_v1_prefix: str = "/api/v1"

    # ⚠️  El default es un placeholder local — NUNCA tiene credenciales reales.
    # En producción se sobreescribe vía .env: DATABASE_URL=postgresql+psycopg://...
    database_url: str = "postgresql+psycopg://user:password@localhost:5432/safpro"

    # ⚠️  Vacío por defecto — la app falla en startup si no se configura en .env.
    # Genera una clave segura con:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    secret_key: str = ""
    algorithm: str = "HS256"
    # 8 horas (reducido desde 24h para que la suspensión de usuarios sea efectiva en <8h
    # sin necesidad de implementar una blacklist de JWTs en Redis).
    access_token_expire_minutes: int = 60 * 8

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

    # ── CORS — orígenes permitidos ────────────────────────────────────────────
    # En producción se sobreescribe via .env.  En debug se permite localhost.
    # Formato: lista separada por comas → "https://safpro.us,https://www.safpro.us"
    cors_allowed_origins: str = "https://safpro.us,https://www.safpro.us"

    @property
    def cors_origins(self) -> list[str]:
        """Devuelve la lista de orígenes CORS parseada."""
        base = [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]
        if self.debug:
            # En local el frontend corre en :3000
            extra = ["http://localhost:3000", "http://127.0.0.1:3000"]
            return list(dict.fromkeys(base + extra))  # dedup preservando orden
        return base

    # ── Sentry — error tracking ───────────────────────────────────────────────
    # Obtener DSN en sentry.io → Settings → Projects → Client Keys
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1   # 10 % de transacciones → Performance
    sentry_profiles_sample_rate: float = 0.1  # 10 % profiling (requiere Perf plan)

    # ── BetterStack — log management ─────────────────────────────────────────
    # Obtener token en betterstack.com → Logs → Sources → Connect source → Python
    betterstack_source_token: str = ""

    # ── Umami Analytics — privacy-friendly ──────────────────────────────────
    # Crear cuenta en umami.is o self-host.
    # El website_id se inyecta en el HTML del frontend via Vite.
    # En este archivo se almacena solo como referencia de configuración.
    umami_website_id: str = ""
    umami_script_url: str = "https://cloud.umami.is/script.js"

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        """En producción (DEBUG=false) falla en startup si las credenciales críticas
        son placeholder/vacías.  Principio fail-fast: mejor no arrancar que arrancar
        con credenciales inseguras sin saberlo.
        """
        if not self.debug:
            # secret_key
            if self.secret_key in _INSECURE_SECRET_EXAMPLES or len(self.secret_key) < 32:
                raise ValueError(
                    "SECRET_KEY inválida o demasiado corta para producción. "
                    "Genera una con: python -c \"import secrets; print(secrets.token_hex(32))\" "
                    "y agrégala al .env del servidor."
                )
            # database_url
            if not self.database_url or "user:password" in self.database_url:
                raise ValueError(
                    "DATABASE_URL no está configurada correctamente para producción. "
                    "Asegúrate de que DATABASE_URL esté en el .env del servidor."
                )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        #extra="ignore",
    )


settings = Settings()