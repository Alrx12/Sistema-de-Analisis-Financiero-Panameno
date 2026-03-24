import logging

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.transaction import LearnRequest, LearnResponse
from app.services.financial_classifier import FinancialClassifier

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
        "SubType Economic": body.subtype_economic,
        "Tipo de transacción": body.transaction_type,
        "Categoría de presupuesto": body.budget_category,
        "budget_role": body.budget_role,
    }

    classifier = FinancialClassifier(user_id=user_id, user_name=user_name)

    # Registramos el conteo previo para detectar si fue a global o personal
    prev_personal_exact = len(classifier.personal_rules["exact_matches"])
    prev_global_exact   = len(classifier.global_rules["exact_matches"])

    classifier.learn(
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
        detail_learned=body.detail.strip().upper(),
        kb_target=kb_target,
        personal_exact_matches=personal_exact,
        personal_patterns=personal_patterns,
    )
