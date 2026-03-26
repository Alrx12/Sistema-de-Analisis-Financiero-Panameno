"""
Endpoints para gestión del Knowledge Base (KB) del usuario.

GET  /kb              → listar todas las entradas del KB personal
DELETE /kb/{key}      → borrar una entrada del KB personal por clave canónica
GET  /kb/preview      → previsualizar la clave canónica de un descriptor raw
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.kb import KBDeleteResponse, KBEntry, KBGlobalListResponse, KBListResponse, KBPreviewResponse
from app.services.detail_normalizer import canonicalize_detail, is_ambiguous_key
from app.services.financial_classifier import FinancialClassifier

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_classifier(current_user: User) -> FinancialClassifier:
    return FinancialClassifier(
        user_id=str(current_user.user_id),
        user_name=current_user.full_name or "",
    )


@router.get(
    "/",
    response_model=KBListResponse,
    summary="Listar entradas del KB personal",
    description=(
        "Retorna todas las entradas exact_match del KB personal del usuario. "
        "Incluye también el resumen del KB global (read-only)."
    ),
)
def list_kb(
    current_user: User = Depends(get_current_user),
) -> KBListResponse:
    clf = _build_classifier(current_user)
    personal = clf.list_personal_kb()
    global_summary = clf.list_global_kb_summary()

    entries = [
        KBEntry(
            key=key,
            economic_type=cats.get("Economic Type"),
            economic_type_detail=cats.get("Economic Type Detail"),
            subtype_economic=cats.get("SubType Economic"),
            budget_category=cats.get("Categoría de presupuesto"),
            budget_role=cats.get("budget_role"),
        )
        for key, cats in personal["exact_matches"].items()
    ]

    # Orden estable: alfabético por clave
    entries.sort(key=lambda e: e.key)

    return KBListResponse(
        entries=entries,
        patterns_count=len(personal["patterns"]),
        corrections_count=personal["corrections_count"],
        global_exact_matches_count=global_summary["exact_matches_count"],
        global_patterns_count=global_summary["patterns_count"],
    )


@router.get(
    "/global",
    response_model=KBGlobalListResponse,
    summary="Listar entradas del KB global",
    description="Retorna todas las entradas exact_match del KB global compartido (read-only).",
)
def list_global_kb(
    current_user: User = Depends(get_current_user),
) -> KBGlobalListResponse:
    clf = _build_classifier(current_user)
    global_data = clf.list_global_kb()

    entries = [
        KBEntry(
            key=key,
            economic_type=cats.get("Economic Type"),
            economic_type_detail=cats.get("Economic Type Detail"),
            subtype_economic=cats.get("SubType Economic"),
            budget_category=cats.get("Categoría de presupuesto"),
            budget_role=cats.get("budget_role"),
        )
        for key, cats in global_data["exact_matches"].items()
    ]
    entries.sort(key=lambda e: e.key)

    return KBGlobalListResponse(
        entries=entries,
        patterns_count=len(global_data["patterns"]),
        corrections_count=global_data["corrections_count"],
    )


@router.get(
    "/preview",
    response_model=KBPreviewResponse,
    summary="Previsualizar clave canónica de un descriptor",
    description=(
        "Muestra qué clave canónica se guardaría en el KB si se llama /learn "
        "con el descriptor dado. Útil para verificar que el normalizer extrae "
        "el merchant correcto antes de entrenar."
    ),
)
def preview_canonical_key(
    detail: str = Query(..., description="Descriptor raw del banco (ej: TRESCUATES-4187-94XX-XXXX-6798)"),
    current_user: User = Depends(get_current_user),
) -> KBPreviewResponse:
    canonical = canonicalize_detail(detail)
    return KBPreviewResponse(
        original=detail,
        canonical_key=canonical,
        is_ambiguous=is_ambiguous_key(canonical),
    )


@router.delete(
    "/{key}",
    response_model=KBDeleteResponse,
    summary="Borrar una entrada del KB personal",
    description=(
        "Elimina la entrada exact_match con la clave canónica dada del KB personal. "
        "También elimina el patrón regex asociado si existe. "
        "La próxima transacción con ese merchant volverá a categorizarse con el KB global "
        "o los patrones builtin. 404 si la clave no existe en el KB personal."
    ),
)
def delete_kb_entry(
    key: str,
    current_user: User = Depends(get_current_user),
) -> KBDeleteResponse:
    clf = _build_classifier(current_user)

    try:
        patterns_removed = clf.delete_personal_entry(key.upper())
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clave '{key}' no encontrada en el KB personal.",
        )

    return KBDeleteResponse(key=key.upper(), patterns_removed=patterns_removed)
