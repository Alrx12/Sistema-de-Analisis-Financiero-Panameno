"""
setup_paypal_plans.py — Crea el Producto y los Planes de suscripción de SAFPRO en PayPal.

Uso:
    cd ~/safpro/backend
    .venv/bin/python scripts/setup_paypal_plans.py

Prerrequisitos:
    1. Cuenta Business de PayPal (paypal.com/business)
    2. App creada en developer.paypal.com → My Apps → Create App
    3. PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el .env
    4. PAYPAL_SANDBOX=true para pruebas, false para producción

Qué hace este script:
    1. Se autentica en la API de PayPal (OAuth2)
    2. Crea un Producto llamado "SAFPRO Pro"
    3. Crea un Plan mensual: $6.50 USD/mes (neto ~$5 después de comisiones + ITBMS)
    4. Crea un Plan anual:   $56.00 USD/año (neto ~$45 después de comisiones + ITBMS)
    5. Imprime los IDs de los planes para pegar en el .env

Precios:
    Mensual: $6.50 USD/mes
      - PayPal cobra ~3.49% + $0.49 fijo en PA → ~$0.72 de comisión
      - ITBMS 7% de comisión PayPal ~$0.05
      - Neto estimado: ~$5.73 → cubre el objetivo de $5/mes con margen

    Anual: $56.00 USD/año
      - PayPal cobra ~3.49% + $0.49 fijo → ~$2.44 de comisión
      - ITBMS 7% de comisión PayPal ~$0.17
      - Neto estimado: ~$53.39/año (~$4.45/mes) → cubre objetivo de $45/año

Tras ejecutar este script, agrega al .env:
    PAYPAL_PLAN_ID_MONTHLY=P-xxxxxxxxxxxxxxxxxxxx
    PAYPAL_PLAN_ID_ANNUAL=P-xxxxxxxxxxxxxxxxxxxx

Luego configura el webhook en developer.paypal.com:
    URL: https://safpro.us/api/v1/billing/paypal/webhook
    Eventos:
      - BILLING.SUBSCRIPTION.ACTIVATED
      - BILLING.SUBSCRIPTION.CANCELLED
      - BILLING.SUBSCRIPTION.SUSPENDED
      - PAYMENT.SALE.COMPLETED
      - PAYMENT.SALE.DENIED
    Copia el Webhook ID al .env:
      PAYPAL_WEBHOOK_ID=xxxxxxxxxxxxxxxxxxxx
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

# Agregar el directorio raíz del backend al path para importar settings
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings


# ── Helpers ──────────────────────────────────────────────────────────────────

def _base_url() -> str:
    if settings.paypal_sandbox:
        return "https://api-m.sandbox.paypal.com"
    return "https://api-m.paypal.com"


def _get_access_token() -> str:
    """Obtiene un Bearer token de PayPal via OAuth2 client_credentials."""
    resp = requests.post(
        f"{_base_url()}/v1/oauth2/token",
        auth=(settings.paypal_client_id, settings.paypal_client_secret),
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError(f"No se obtuvo access_token. Respuesta: {resp.text}")
    return token


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "PayPal-Request-Id": f"safpro-setup-{__import__('uuid').uuid4()}",
        "Prefer": "return=representation",
    }


# ── Creación de producto ──────────────────────────────────────────────────────

def create_product(token: str) -> str:
    """
    Crea el Producto 'SAFPRO Pro' en PayPal.
    Si ya existe un producto con el mismo nombre, PayPal retorna error — en ese
    caso lista los productos y usa el primero que encuentre.
    Retorna el product_id.
    """
    print("▶ Creando producto 'SAFPRO Pro'...")

    payload = {
        "name": "SAFPRO Pro",
        "description": "Sistema de Análisis Financiero Profesional — Plan Pro",
        "type": "SERVICE",
        "category": "SOFTWARE",
        "image_url": "https://safpro.us/logo.png",
        "home_url": "https://safpro.us",
    }

    resp = requests.post(
        f"{_base_url()}/v1/catalogs/products",
        headers=_headers(token),
        json=payload,
        timeout=15,
    )

    if resp.status_code in (200, 201):
        product_id = resp.json()["id"]
        print(f"  ✅ Producto creado: {product_id}")
        return product_id

    # Si ya existe, listar y usar el primero
    if resp.status_code == 422 and "DUPLICATE_RESOURCE_IDENTIFIER" in resp.text:
        print("  ⚠️  Producto ya existe. Listando productos existentes...")
        list_resp = requests.get(
            f"{_base_url()}/v1/catalogs/products",
            headers=_headers(token),
            timeout=15,
        )
        list_resp.raise_for_status()
        products = list_resp.json().get("products", [])
        if not products:
            raise RuntimeError("No hay productos y tampoco se pudo crear uno nuevo.")
        product_id = products[0]["id"]
        print(f"  ♻️  Usando producto existente: {product_id} ({products[0].get('name', '?')})")
        return product_id

    resp.raise_for_status()
    raise RuntimeError(f"Error inesperado creando producto: {resp.text}")


# ── Creación de planes ────────────────────────────────────────────────────────

def create_plan(token: str, product_id: str, interval: str) -> str:
    """
    Crea un Plan de suscripción en PayPal.

    interval: "monthly" → $6.50 USD/mes
              "annual"  → $56.00 USD/año

    Retorna el plan_id (P-xxxx).
    """
    if interval == "monthly":
        amount = "6.50"
        interval_unit = "MONTH"
        interval_count = 1
        plan_name = "SAFPRO Pro — Mensual"
        plan_desc = "Plan Pro mensual · $6.50 USD/mes · Cancela cuando quieras"
    elif interval == "annual":
        amount = "56.00"
        interval_unit = "YEAR"
        interval_count = 1
        plan_name = "SAFPRO Pro — Anual"
        plan_desc = "Plan Pro anual · $56.00 USD/año (ahorra un 28% vs mensual)"
    else:
        raise ValueError(f"interval inválido: {interval!r}")

    print(f"▶ Creando plan {interval} ({amount} USD)...")

    payload = {
        "product_id": product_id,
        "name": plan_name,
        "description": plan_desc,
        "status": "ACTIVE",
        "billing_cycles": [
            {
                "frequency": {
                    "interval_unit": interval_unit,
                    "interval_count": interval_count,
                },
                "tenure_type": "REGULAR",
                "sequence": 1,
                "total_cycles": 0,  # 0 = sin límite (se renueva indefinidamente)
                "pricing_scheme": {
                    "fixed_price": {
                        "value": amount,
                        "currency_code": "USD",
                    }
                },
            }
        ],
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "setup_fee": {
                "value": "0",
                "currency_code": "USD",
            },
            "setup_fee_failure_action": "CONTINUE",
            "payment_failure_threshold": 3,
        },
        "taxes": {
            "percentage": "0",   # No aplicamos ITBMS desde PayPal (ya incluido en el precio)
            "inclusive": False,
        },
    }

    resp = requests.post(
        f"{_base_url()}/v1/billing/plans",
        headers=_headers(token),
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()

    plan = resp.json()
    plan_id = plan["id"]
    print(f"  ✅ Plan creado: {plan_id}")
    print(f"     Nombre: {plan['name']}")
    print(f"     Estado: {plan['status']}")
    return plan_id


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    env_label = "SANDBOX 🟡" if settings.paypal_sandbox else "PRODUCCIÓN 🔴"

    print("=" * 60)
    print(f"  SAFPRO — Setup de Planes PayPal ({env_label})")
    print("=" * 60)

    # Verificar configuración mínima
    if not settings.paypal_client_id or not settings.paypal_client_secret:
        print()
        print("❌ ERROR: PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET deben estar en el .env")
        print()
        print("Pasos para obtenerlos:")
        print("  1. Ve a developer.paypal.com")
        print("  2. My Apps & Credentials → Create App")
        print("  3. Copia el Client ID y el Secret")
        print("  4. Agrégalos al .env:")
        print("     PAYPAL_CLIENT_ID=Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        print("     PAYPAL_CLIENT_SECRET=Exxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        sys.exit(1)

    print(f"\nBase URL: {_base_url()}")
    print(f"Client ID: {settings.paypal_client_id[:12]}...")

    try:
        # 1. Autenticar
        print("\n▶ Autenticando con PayPal...")
        token = _get_access_token()
        print("  ✅ Token obtenido correctamente")

        # 2. Crear o reutilizar producto
        print()
        product_id = create_product(token)

        # 3. Crear plan mensual
        print()
        monthly_plan_id = create_plan(token, product_id, "monthly")

        # 4. Crear plan anual
        print()
        annual_plan_id = create_plan(token, product_id, "annual")

    except requests.HTTPError as exc:
        print(f"\n❌ Error HTTP de PayPal: {exc}")
        if exc.response is not None:
            try:
                error_detail = exc.response.json()
                print(f"   Detalle: {json.dumps(error_detail, indent=2)}")
            except Exception:
                print(f"   Body: {exc.response.text[:500]}")
        sys.exit(1)
    except Exception as exc:
        print(f"\n❌ Error inesperado: {exc}")
        sys.exit(1)

    # 5. Resultado
    print()
    print("=" * 60)
    print("  ✅ Setup completado — agrega esto a tu .env:")
    print("=" * 60)
    print()
    print(f"PAYPAL_PLAN_ID_MONTHLY={monthly_plan_id}")
    print(f"PAYPAL_PLAN_ID_ANNUAL={annual_plan_id}")
    print()
    print("─" * 60)
    print("  Próximos pasos:")
    print("─" * 60)
    print()
    print("1. Agrega los plan IDs al .env del servidor:")
    print(f"   PAYPAL_PLAN_ID_MONTHLY={monthly_plan_id}")
    print(f"   PAYPAL_PLAN_ID_ANNUAL={annual_plan_id}")
    print()
    print("2. Configura el webhook en developer.paypal.com:")
    if settings.paypal_sandbox:
        print("   (Sandbox) → Webhooks → Add Webhook")
    else:
        print("   (Live) → Webhooks → Add Webhook")
    print("   URL: https://safpro.us/api/v1/billing/paypal/webhook")
    print()
    print("   Eventos a suscribir:")
    print("     ✓ BILLING.SUBSCRIPTION.ACTIVATED")
    print("     ✓ BILLING.SUBSCRIPTION.CANCELLED")
    print("     ✓ BILLING.SUBSCRIPTION.SUSPENDED")
    print("     ✓ PAYMENT.SALE.COMPLETED")
    print("     ✓ PAYMENT.SALE.DENIED")
    print()
    print("3. Copia el Webhook ID al .env:")
    print("   PAYPAL_WEBHOOK_ID=xxxxxxxxxxxxxxxxxxxx")
    print()
    print("4. Reinicia el servidor:")
    print("   systemctl --user restart safpro-api")
    print()
    if settings.paypal_sandbox:
        print("⚠️  Estás en modo SANDBOX. Repite este script con PAYPAL_SANDBOX=false")
        print("   para producción (obtendrás IDs de planes distintos).")
        print()


if __name__ == "__main__":
    main()
