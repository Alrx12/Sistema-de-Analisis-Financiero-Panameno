"""
contact.py — Formulario de contacto público de SAFPRO.

Endpoint:
  POST /contact  → Recibe nombre, email y mensaje; envía a admin@safpro.us via Resend.
                   Sin autenticación JWT (es un formulario público).
                   Rate limited: 5 mensajes por IP por hora.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, field_validator

from app.services.email_service import send_contact_form_email

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schema ────────────────────────────────────────────────────────────────────

class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    message: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede estar vacío.")
        if len(v) > 120:
            raise ValueError("El nombre no puede superar los 120 caracteres.")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El mensaje no puede estar vacío.")
        if len(v) > 2000:
            raise ValueError("El mensaje no puede superar los 2000 caracteres.")
        return v


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    status_code=status.HTTP_200_OK,
    summary="Formulario de contacto público (sin auth JWT)",
)
async def contact_form(
    payload: ContactRequest,
    request: Request,
) -> JSONResponse:
    """
    Recibe un mensaje del formulario de contacto y lo reenvía a admin@safpro.us.

    Sin autenticación — cualquier visitante puede usarlo.
    Rate limiting: slowapi limita a 5 requests/hora por IP cuando DEBUG=false.
    """
    ip = request.client.host if request.client else "unknown"
    logger.info("contact_form | ip=%s name=%r email=%r", ip, payload.name, payload.email)

    try:
        send_contact_form_email(
            sender_name=payload.name,
            sender_email=payload.email,
            message=payload.message,
        )
    except Exception as exc:
        # Log pero no exponer el error al visitante — igual devolvemos 200
        # para no revelar la configuración interna ni permitir enumeración
        logger.error("Error enviando email de contacto: %s", exc)

    return JSONResponse(
        status_code=200,
        content={"status": "ok", "message": "Mensaje recibido. Te responderemos pronto."},
    )
