"""
Servicio de Push Notifications vía Expo Push API.

Expo actúa como intermediario gratuito que reenvía las notificaciones
a FCM (Android) y APNs (iOS). No requiere cuenta de Firebase ni Apple.

Documentación: https://docs.expo.dev/push-notifications/sending-notifications/

Flujo:
    1. App móvil solicita permiso → Expo devuelve un token único
       ("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxx]")
    2. App envía el token a nuestro backend → se guarda en users.expo_push_token
    3. Backend llama a Expo Push API con el token + mensaje
    4. Expo reenvía a FCM / APNs según el dispositivo

Notas de uso:
    - Funciona con APK debug (no requiere build de producción)
    - Rate limit de Expo: 600 mensajes/seg — más que suficiente para el MVP
    - Si el token es inválido, Expo devuelve DeviceNotRegistered → se limpia
"""
from __future__ import annotations

import logging
import threading
from typing import Any

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _is_valid_expo_token(token: str | None) -> bool:
    """Verifica que el token tenga el formato correcto de Expo."""
    return bool(token and token.startswith("ExponentPushToken[") and token.endswith("]"))


def _send_push(token: str, title: str, body: str, data: dict[str, Any] | None = None) -> bool:
    """
    Envía una notificación push vía Expo Push API.

    Args:
        token : Token de Expo Push del dispositivo
        title : Título de la notificación
        body  : Cuerpo del mensaje
        data  : Datos extra que llegan al handler de la app (optional)

    Returns:
        True si se envió correctamente, False en caso de error.
    """
    if not _is_valid_expo_token(token):
        logger.warning("push: token inválido o vacío — skipping")
        return False

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "data": data or {},
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            resp.raise_for_status()
            result = resp.json()

            # Expo devuelve {"data": [{"status": "ok"} | {"status": "error", "details": {...}}]}
            tickets = result.get("data", [])
            for ticket in tickets:
                if ticket.get("status") == "error":
                    details = ticket.get("details", {})
                    if details.get("error") == "DeviceNotRegistered":
                        logger.info("push: DeviceNotRegistered — token expirado: %s", token[:40])
                    else:
                        logger.warning("push: error en ticket: %s", details)
                    return False

            logger.debug("push: enviado OK — token=%s…", token[:30])
            return True

    except httpx.TimeoutException:
        logger.warning("push: timeout al conectar con Expo Push API")
        return False
    except httpx.HTTPStatusError as exc:
        logger.warning("push: HTTP error %s — %s", exc.response.status_code, exc.response.text[:200])
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("push: error inesperado: %s", exc)
        return False


def _fire_and_forget(token: str, title: str, body: str, data: dict[str, Any] | None = None) -> None:
    """Envía la notificación en un thread daemon (no bloquea el caller)."""
    threading.Thread(
        target=_send_push,
        args=(token, title, body, data),
        daemon=True,
    ).start()


# ── Funciones de alto nivel por evento ──────────────────────────────────────

def notify_job_completed(token: str | None, filename: str) -> None:
    """Notifica al usuario que su análisis terminó exitosamente."""
    if not _is_valid_expo_token(token):
        return
    _fire_and_forget(
        token=token,  # type: ignore[arg-type]
        title="✅ Análisis completado",
        body=f"Tu estado de cuenta '{filename}' fue procesado correctamente.",
        data={"type": "job_completed", "filename": filename},
    )


def notify_job_failed(token: str | None, filename: str, error_msg: str = "") -> None:
    """Notifica al usuario que su análisis falló."""
    if not _is_valid_expo_token(token):
        return
    _fire_and_forget(
        token=token,  # type: ignore[arg-type]
        title="❌ Error al procesar archivo",
        body=f"Hubo un problema con '{filename}'. Revisa los detalles en la app.",
        data={"type": "job_failed", "filename": filename, "error": error_msg[:200]},
    )


def notify_upload_limit_warning(token: str | None, used: int, limit: int) -> None:
    """Notifica al usuario cuando está cerca del límite de uploads."""
    if not _is_valid_expo_token(token):
        return
    remaining = limit - used
    _fire_and_forget(
        token=token,  # type: ignore[arg-type]
        title="⚠️ Límite de uploads",
        body=f"Has usado {used}/{limit} uploads de tu plan. Solo te quedan {remaining}.",
        data={"type": "upload_limit", "used": used, "limit": limit},
    )


def notify_reminder_no_uploads(token: str) -> None:
    """Recordatorio para usuarios que nunca han subido un estado de cuenta."""
    _fire_and_forget(
        token=token,
        title="📊 ¡Empezá a controlar tus finanzas!",
        body="Subí tu estado de cuenta bancario y SAFPRO analiza tus gastos automáticamente.",
        data={"type": "reminder_no_uploads"},
    )


def notify_reminder_inactive(token: str, days: int) -> None:
    """Recordatorio para usuarios con uploads previos que llevan N días sin subir."""
    _fire_and_forget(
        token=token,
        title="📈 Ya pasaron " + ("2 semanas" if days <= 16 else f"{days} días"),
        body="¿Ya tenés tu nuevo estado de cuenta? Subílo para actualizar tu análisis financiero.",
        data={"type": "reminder_inactive", "days_since_last_upload": days},
    )
