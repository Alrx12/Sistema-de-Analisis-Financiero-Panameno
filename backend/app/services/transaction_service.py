"""
transaction_service.py — Servicio de operaciones sobre transacciones individuales.

Actualmente implementa:
  - reclassify_transaction(): corrige la categorización de una transacción
    ya guardada en analysis_transactions y opcionalmente enseña al KB.
"""
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.analysis_transaction import AnalysisTransaction
from app.models.user import User
from app.services.financial_classifier import FinancialClassifier

logger = logging.getLogger(__name__)


def reclassify_transaction(
    *,
    db: Session,
    transaction_id: UUID,
    user: User,
    economic_type: str,
    economic_type_detail: str | None = None,
    subtype_economic: str | None = None,
    budget_category: str,
    budget_role: str,
    also_learn: bool = True,
    force_personal: bool = False,
    weight: float = 2.0,
) -> dict | None:
    """
    Actualiza la clasificación de una transacción existente y opcionalmente
    enseña al KB para que el clasificador aprenda del ejemplo.

    Retorna None si la transacción no existe o no pertenece al usuario
    (el endpoint mapea esto a HTTP 404).

    Retorna un dict con:
        - "transaction": instancia AnalysisTransaction actualizada y refrescada
        - "learn_result": dict con detail_learned/kb_target/personal_exact_matches/
                          personal_patterns, o None si also_learn=False
    """
    tx = db.get(AnalysisTransaction, transaction_id)

    if tx is None or tx.user_id != user.user_id:
        return None

    # ── 1. Actualizar campos de clasificación ──────────────────────────────
    tx.economic_type = economic_type
    tx.economic_type_detail = economic_type_detail
    if subtype_economic is not None:
        tx.subtype_economic = subtype_economic
    tx.budget_category = budget_category
    tx.budget_role = budget_role
    tx.confidence = 1.0
    tx.method = "user_reclassified"
    tx.user_reclassified = True

    db.commit()
    db.refresh(tx)

    logger.info(
        "Transacción reclasificada — transaction_id=%s, user_id=%s, "
        "budget_category=%r, budget_role=%r",
        transaction_id,
        user.user_id,
        budget_category,
        budget_role,
    )

    # ── 2. Enseñar al KB (opcional) ────────────────────────────────────────
    learn_result = None
    if also_learn:
        user_id_str = str(user.user_id)
        user_name = user.full_name or user.username

        classifier = FinancialClassifier(user_id=user_id_str, user_name=user_name)

        categories = {
            "Economic Type": economic_type,
            "Economic Type Detail": economic_type_detail,
            "SubType Economic": subtype_economic,
            "Categoría de presupuesto": budget_category,
            "budget_role": budget_role,
        }

        prev_global_exact = len(classifier.global_rules["exact_matches"])

        canonical_key = classifier.learn(
            detail=tx.detail,
            categories=categories,
            weight=weight,
            force_personal=force_personal,
        )

        new_global_exact = len(classifier.global_rules["exact_matches"])
        kb_target = "global" if new_global_exact > prev_global_exact else "personal"

        learn_result = {
            "detail_learned": canonical_key,
            "kb_target": kb_target,
            "personal_exact_matches": len(classifier.personal_rules["exact_matches"]),
            "personal_patterns": len(classifier.personal_rules["patterns"]),
        }

        logger.info(
            "KB actualizado vía reclassify — user_id=%s, detail=%r, "
            "canonical=%r, kb_target=%s",
            user_id_str,
            tx.detail[:80],
            canonical_key,
            kb_target,
        )

    return {"transaction": tx, "learn_result": learn_result}
