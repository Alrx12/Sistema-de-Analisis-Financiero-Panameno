import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.analysis_transaction import AnalysisTransactionResponse
from app.schemas.transaction import (
    LearnRequest,
    LearnResponse,
    ReclassifyRequest,
    ReclassifyResponse,
)
from app.services.financial_classifier import FinancialClassifier
from app.services.transaction_service import reclassify_transaction

logger = logging.getLogger(__name__)

router = APIRouter()


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
