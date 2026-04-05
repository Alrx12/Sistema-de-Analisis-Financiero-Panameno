import logging
from collections import defaultdict
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_transaction import AnalysisTransaction
from app.models.user import User
from app.schemas.analysis_transaction import AnalysisTransactionResponse
from app.schemas.transaction import (
    LearnRequest,
    LearnResponse,
    ReclassifyRequest,
    ReclassifyResponse,
)
from app.services.analytics_service import track_event
from app.services.detail_normalizer import canonicalize_detail
from app.services.financial_classifier import FinancialClassifier
from app.services.transaction_service import reclassify_transaction

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas internos para review-groups ──────────────────────────────────────

class ReviewGroup(BaseModel):
    canonical_key: str
    sample_detail: str
    count: int
    total_amount: float
    transaction_ids: list[UUID]
    current_category: str | None = None
    current_budget_role: str | None = None


_BUDGET_ROLE_LIT = Literal[
    "presupuestable", "no_presupuestable", "gasto_operativo",
    "gasto_financiero", "ahorro_inversion", "solo_balance", "revisar",
]


class ApplyGroupRequest(BaseModel):
    canonical_key: str
    transaction_ids: list[UUID]
    sample_detail: str
    economic_type: str = Field(default="gasto")
    economic_type_detail: str | None = None
    subtype_economic: str | None = None
    budget_category: str
    budget_role: _BUDGET_ROLE_LIT
    also_learn: bool = True
    force_personal: bool = False
    weight: float = Field(default=2.0)


class ApplyGroupResponse(BaseModel):
    updated_count: int
    canonical_key: str
    detail_learned: str | None = None
    kb_target: str | None = None


# ─── GET /review-groups ───────────────────────────────────────────────────────

@router.get(
    "/review-groups",
    response_model=list[ReviewGroup],
    summary="Transacciones que requieren revisión, agrupadas por merchant canónico",
)
def get_review_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ReviewGroup]:
    """
    Devuelve todas las transacciones de gasto del usuario que requieren revisión,
    agrupadas por su clave canónica. Solo débitos no reclasificados manualmente.
    """
    txs = (
        db.query(AnalysisTransaction)
        .filter(
            AnalysisTransaction.user_id == current_user.user_id,
            AnalysisTransaction.amount < 0,
            or_(
                # Transacciones inciertas que no han sido corregidas manualmente
                and_(
                    AnalysisTransaction.method != "user_reclassified",
                    or_(
                        AnalysisTransaction.confidence < 0.8,
                        AnalysisTransaction.budget_role == "revisar",
                        AnalysisTransaction.budget_category.ilike("%desconocido%"),
                    ),
                ),
                # "otros" siempre requiere atención, incluso si tiene confianza alta
                # o fue clasificado manualmente como "otros" por error
                AnalysisTransaction.budget_category == "otros",
            ),
        )
        .all()
    )

    groups: dict[str, dict] = defaultdict(lambda: {
        "sample_detail": "",
        "count": 0,
        "total_amount": 0.0,
        "transaction_ids": [],
        "current_category": None,
        "current_budget_role": None,
    })

    for tx in txs:
        try:
            key = canonicalize_detail(tx.detail) or tx.detail[:40]
        except Exception:
            key = tx.detail[:40]

        g = groups[key]
        g["count"] += 1
        g["total_amount"] += abs(float(tx.amount))
        g["transaction_ids"].append(tx.transaction_id)
        if not g["sample_detail"]:
            g["sample_detail"] = tx.detail
        if tx.budget_category:
            g["current_category"] = tx.budget_category
        if tx.budget_role:
            g["current_budget_role"] = tx.budget_role

    return sorted(
        [
            ReviewGroup(
                canonical_key=key,
                sample_detail=g["sample_detail"],
                count=g["count"],
                total_amount=round(g["total_amount"], 2),
                transaction_ids=g["transaction_ids"],
                current_category=g["current_category"],
                current_budget_role=g["current_budget_role"],
            )
            for key, g in groups.items()
        ],
        key=lambda x: -x.count,
    )


# ─── POST /review-groups/apply ────────────────────────────────────────────────

@router.post(
    "/review-groups/apply",
    response_model=ApplyGroupResponse,
    summary="Aplicar clasificación a un grupo + entrenar KB",
)
def apply_review_group(
    body: ApplyGroupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplyGroupResponse:
    """
    Bulk update de todas las transacciones del grupo y entrenamiento del KB.
    """
    result = db.execute(
        update(AnalysisTransaction)
        .where(
            AnalysisTransaction.transaction_id.in_(body.transaction_ids),
            AnalysisTransaction.user_id == current_user.user_id,
        )
        .values(
            economic_type=body.economic_type,
            economic_type_detail=body.economic_type_detail,
            subtype_economic=body.subtype_economic,
            budget_category=body.budget_category,
            budget_role=body.budget_role,
            confidence=1.0,
            method="user_reclassified",
            user_reclassified=True,
        )
    )
    db.commit()
    updated_count = result.rowcount

    detail_learned = None
    kb_target = None

    if body.also_learn and updated_count > 0:
        user_id = str(current_user.user_id)
        user_name = current_user.full_name or current_user.username
        classifier = FinancialClassifier(user_id=user_id, user_name=user_name)
        categories = {
            "Economic Type": body.economic_type,
            "Economic Type Detail": body.economic_type_detail or "gasto_variable",
            "SubType Economic": body.subtype_economic or "extraordinario",
            "Categoría de presupuesto": body.budget_category,
            "budget_role": body.budget_role,
        }
        prev_global = len(classifier.global_rules["exact_matches"])
        detail_learned = classifier.learn(
            detail=body.sample_detail,
            categories=categories,
            weight=body.weight,
            force_personal=body.force_personal,
        )
        new_global = len(classifier.global_rules["exact_matches"])
        kb_target = "global" if new_global > prev_global else "personal"
        logger.info(
            "Bulk review-group applied — user=%s, key=%r, updated=%d, kb=%s",
            user_id, body.canonical_key, updated_count, kb_target,
        )

    return ApplyGroupResponse(
        updated_count=updated_count,
        canonical_key=body.canonical_key,
        detail_learned=detail_learned,
        kb_target=kb_target,
    )


@router.post(
    "/learn",
    response_model=LearnResponse,
    summary="Corregir/enseñar una categorización al KB personal",
    description=(
        "Permite al usuario corregir la categorización de una transacción. "
        "El sistema aprende el ejemplo y actualiza el Knowledge Base personal del usuario. "
        "Si el detalle contiene keywords de marcas globales (Uber, Netflix, etc.) y "
        "`force_personal` es False, el ejemplo se guarda en el KB global."
    ),
)
def learn_transaction(
    body: LearnRequest,
    current_user: User = Depends(get_current_user),
) -> LearnResponse:
    """
    Registra una corrección de categorización y actualiza el KB del usuario.

    El método FinancialClassifier.learn() decide si el ejemplo va al KB global o personal
    basándose en las keywords del detalle y el flag force_personal.
    """
    user_id = str(current_user.user_id)
    user_name = current_user.full_name or current_user.username

    categories = {
        "Economic Type": body.economic_type,
        "Economic Type Detail": body.economic_type_detail,
        "SubType Economic": body.subtype_economic,
        "Categoría de presupuesto": body.budget_category,
        "budget_role": body.budget_role,
    }

    classifier = FinancialClassifier(user_id=user_id, user_name=user_name)

    # Registramos el conteo previo para detectar si fue a global o personal
    prev_personal_exact = len(classifier.personal_rules["exact_matches"])
    prev_global_exact   = len(classifier.global_rules["exact_matches"])

    canonical_key = classifier.learn(
        detail=body.detail,
        categories=categories,
        weight=body.weight,
        force_personal=body.force_personal,
    )

    # Determinar en qué KB se guardó
    new_personal_exact = len(classifier.personal_rules["exact_matches"])
    new_global_exact   = len(classifier.global_rules["exact_matches"])

    if new_global_exact > prev_global_exact:
        kb_target = "global"
    else:
        kb_target = "personal"

    personal_exact = new_personal_exact
    personal_patterns = len(classifier.personal_rules["patterns"])

    logger.info(
        "KB actualizado — user_id=%s, detail=%r, kb_target=%s, weight=%.1f",
        user_id,
        body.detail[:80],
        kb_target,
        body.weight,
    )

    track_event(
        user_id=current_user.user_id,
        event_type="learn_transaction",
        plan=getattr(current_user, "plan", None),
        metadata={
            "canonical_key": canonical_key,
            "kb_target": kb_target,
            "budget_category": body.budget_category,
        },
    )

    return LearnResponse(
        message=f"KB {kb_target} actualizado correctamente.",
        detail_learned=canonical_key,
        kb_target=kb_target,
        personal_exact_matches=personal_exact,
        personal_patterns=personal_patterns,
    )


@router.post(
    "/{transaction_id}/reclassify",
    response_model=ReclassifyResponse,
    summary="Reclasificar una transacción existente",
    description=(
        "Corrige la categorización de una transacción ya guardada en la base de datos. "
        "La transacción queda con confidence=1.0 y method='user_reclassified'. "
        "Si `also_learn=True` (default), también guarda la corrección en el KB para que "
        "futuras transacciones con el mismo descriptor se clasifiquen correctamente de forma automática. "
        "Útil cuando el usuario revisa GET /analysis/{snapshot_id}/transactions y "
        "encuentra una categorización incorrecta."
    ),
)
def reclassify_transaction_endpoint(
    transaction_id: UUID,
    body: ReclassifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReclassifyResponse:
    """
    Reclasifica una transacción existente y opcionalmente actualiza el KB.

    - Verifica que la transacción exista y pertenezca al usuario actual.
    - Actualiza los campos de clasificación en la DB.
    - Si also_learn=True, llama a FinancialClassifier.learn() con el detalle raw
      de la transacción para que el sistema aprenda el ejemplo.
    """
    result = reclassify_transaction(
        db=db,
        transaction_id=transaction_id,
        user=current_user,
        economic_type=body.economic_type,
        economic_type_detail=body.economic_type_detail,
        subtype_economic=body.subtype_economic,
        budget_category=body.budget_category,
        budget_role=body.budget_role,
        also_learn=body.also_learn,
        force_personal=body.force_personal,
        weight=body.weight,
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transacción no encontrada.",
        )

    tx = result["transaction"]
    learn_result = result["learn_result"]

    # Construir AnalysisTransactionResponse con requires_review calculado
    tx_response = AnalysisTransactionResponse.model_validate(tx)
    tx_response.requires_review = float(tx.confidence) < 0.8  # siempre False tras reclassify (confidence=1.0)

    if learn_result:
        return ReclassifyResponse(
            transaction=tx_response,
            learned=True,
            detail_learned=learn_result["detail_learned"],
            kb_target=learn_result["kb_target"],
            personal_exact_matches=learn_result["personal_exact_matches"],
            personal_patterns=learn_result["personal_patterns"],
        )

    return ReclassifyResponse(
        transaction=tx_response,
        learned=False,
    )
