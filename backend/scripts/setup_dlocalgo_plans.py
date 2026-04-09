#!/usr/bin/env python3
"""
setup_dlocalgo_plans.py — Crea los planes de suscripción mensual y anual en dLocal Go.

Ejecutar UNA SOLA VEZ después de obtener las API keys de dLocal Go.
Los IDs generados se deben agregar al .env del servidor:
  DLOCALGO_PLAN_ID_MONTHLY=<id del plan mensual>
  DLOCALGO_PLAN_ID_ANNUAL=<id del plan anual>

Uso:
  # Desde backend/ con .venv activo
  cd ~/safpro/backend
  .venv/bin/python scripts/setup_dlocalgo_plans.py

  # Ver planes existentes sin crear nuevos
  .venv/bin/python scripts/setup_dlocalgo_plans.py --list

  # Usar sandbox (default) o live
  .venv/bin/python scripts/setup_dlocalgo_plans.py                  # sandbox
  DLOCALGO_SANDBOX=false .venv/bin/python scripts/setup_dlocalgo_plans.py  # live

⚠️  IMPORTANTE:
  - No ejecutes esto más de una vez o crearás planes duplicados en dLocal Go.
  - dLocal Go no tiene endpoint para eliminar planes, solo para desactivarlos.
  - Los planes se crean con country="PA" y currency="USD" para Panamá.
"""
from __future__ import annotations

import json
import sys
import os

# Agregar el directorio raíz al path para poder importar settings
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx

try:
    from app.core.config import settings
except ImportError:
    print("ERROR: No se pudo importar settings. Ejecuta desde el directorio backend/")
    print("  cd ~/safpro/backend && .venv/bin/python scripts/setup_dlocalgo_plans.py")
    sys.exit(1)


def _api_base() -> str:
    if settings.dlocalgo_sandbox:
        return "https://api-sbx.dlocalgo.com"
    return "https://api.dlocalgo.com"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.dlocalgo_api_key}:{settings.dlocalgo_secret_key}",
        "Content-Type": "application/json",
    }


def _check_config() -> None:
    if not settings.dlocalgo_api_key or not settings.dlocalgo_secret_key:
        print("ERROR: DLOCALGO_API_KEY y DLOCALGO_SECRET_KEY no están en el .env")
        print()
        print("Pasos para obtenerlas:")
        print("  1. Crea una cuenta en https://merchant.dlocalgo.com")
        print("  2. Ve a Developers → API Keys")
        print("  3. Copia la API Key y la Secret Key al .env:")
        print("     DLOCALGO_API_KEY=tu_api_key")
        print("     DLOCALGO_SECRET_KEY=tu_secret_key")
        print("     DLOCALGO_SANDBOX=true   # ← sandbox para pruebas")
        sys.exit(1)


def test_connection() -> bool:
    """Verifica que las credenciales sean válidas antes de crear planes."""
    url = f"{_api_base()}/v1/me"
    try:
        resp = httpx.get(url, headers=_headers(), timeout=10.0)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ✅ Conexión exitosa — merchant: {data.get('merchant_name', 'N/A')}")
            print(f"     Entorno: {'🧪 SANDBOX' if settings.dlocalgo_sandbox else '🚀 LIVE'}")
            return True
        else:
            print(f"  ❌ Credenciales inválidas — HTTP {resp.status_code}: {resp.text[:200]}")
            return False
    except httpx.RequestError as exc:
        print(f"  ❌ Error de conexión: {exc}")
        return False


def create_plan(name: str, description: str, amount: float, frequency_type: str, frequency_value: int) -> dict:
    """Crea un plan de suscripción en dLocal Go y devuelve el objeto del plan."""
    webhook_url = f"{settings.backend_base}/api/v1/billing/webhook"

    payload = {
        "name": name,
        "description": description,
        "country": "PA",          # Panamá
        "currency": "USD",
        "amount": amount,
        "frequency_type": frequency_type,  # "MONTHLY" | "YEARLY"
        "frequency_value": frequency_value,
        "notification_url": webhook_url,
    }

    print(f"\n  Creando plan: {name}")
    print(f"    amount: ${amount} USD | frequency: {frequency_value} {frequency_type}")
    print(f"    notification_url: {webhook_url}")

    url = f"{_api_base()}/v1/subscription/plan"
    resp = httpx.post(url, headers=_headers(), json=payload, timeout=15.0)

    if resp.status_code not in (200, 201):
        print(f"  ❌ Error creando plan — HTTP {resp.status_code}: {resp.text[:400]}")
        sys.exit(1)

    plan = resp.json()
    print(f"  ✅ Plan creado — ID: {plan.get('id')} | subscribe_url: {plan.get('subscribe_url', 'N/A')[:60]}...")
    return plan


def list_plans() -> None:
    """Lista todos los planes existentes en dLocal Go."""
    url = f"{_api_base()}/v1/subscription/plan/all"
    resp = httpx.get(url, headers=_headers(), timeout=10.0)

    if resp.status_code != 200:
        print(f"Error obteniendo planes — HTTP {resp.status_code}: {resp.text[:300]}")
        return

    plans = resp.json()
    if not plans:
        print("  (No hay planes creados todavía)")
        return

    for plan in plans:
        print(f"\n  ID: {plan.get('id')}")
        print(f"  Nombre: {plan.get('name')}")
        print(f"  Monto: ${plan.get('amount')} {plan.get('currency')}")
        print(f"  Frecuencia: {plan.get('frequency_value')} {plan.get('frequency_type')}")
        print(f"  Status: {plan.get('status', 'N/A')}")


def main() -> None:
    is_list_mode = "--list" in sys.argv

    print("=" * 60)
    print("  dLocal Go — Setup de planes de suscripción SAFPRO")
    print("=" * 60)

    _check_config()

    print(f"\n🔌 Verificando conexión ({_api_base()})...")
    if not test_connection():
        sys.exit(1)

    if is_list_mode:
        print("\n📋 Planes existentes:")
        list_plans()
        return

    # Advertencia antes de crear
    env_label = "🧪 SANDBOX" if settings.dlocalgo_sandbox else "🚀 LIVE"
    print(f"\n⚠️  Se crearán 2 planes en {env_label}:")
    print("   1. Plan Pro Mensual  — $5.00 USD/mes")
    print("   2. Plan Pro Anual    — $45.00 USD/año")
    print()
    confirm = input("   ¿Continuar? (escribe 'SI' para confirmar): ").strip()
    if confirm.upper() != "SI":
        print("   Cancelado.")
        return

    print("\n📦 Creando planes...")

    # Plan mensual
    monthly = create_plan(
        name="SAFPRO Pro Mensual",
        description="Análisis financiero ilimitado — $5/mes. Cancela cuando quieras.",
        amount=5.00,
        frequency_type="MONTHLY",
        frequency_value=1,
    )

    # Plan anual
    annual = create_plan(
        name="SAFPRO Pro Anual",
        description="Análisis financiero ilimitado — $45/año. Ahorra 25% vs mensual.",
        amount=45.00,
        frequency_type="YEARLY",
        frequency_value=1,
    )

    monthly_id = monthly.get("id", "")
    annual_id = annual.get("id", "")

    print("\n" + "=" * 60)
    print("  ✅ Planes creados exitosamente")
    print("=" * 60)
    print("\n  Agrega estas variables al .env del servidor:")
    print()
    print(f"  DLOCALGO_PLAN_ID_MONTHLY={monthly_id}")
    print(f"  DLOCALGO_PLAN_ID_ANNUAL={annual_id}")
    print()
    print("  Luego reinicia el servidor:")
    print("  systemctl --user restart safpro-api safpro-worker")
    print()

    # Guardar en archivo local para referencia
    output = {
        "environment": "sandbox" if settings.dlocalgo_sandbox else "live",
        "monthly": {"id": monthly_id, "plan": monthly},
        "annual": {"id": annual_id, "plan": annual},
    }
    output_file = "storage/dlocalgo_plans.json"
    try:
        os.makedirs("storage", exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(output, f, indent=2, default=str)
        print(f"  📄 Detalle guardado en: {output_file}")
    except Exception as exc:
        print(f"  (No se pudo guardar {output_file}: {exc})")


if __name__ == "__main__":
    main()
