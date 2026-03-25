"""
Puente entre el pipeline de procesamiento y el FinancialClassifier.

Responsabilidades:
  - Mapear el dict de transacción interno al formato que espera predict()
  - Instanciar el clasificador con user_id y user_name
  - Devolver las transacciones enriquecidas con campos de categorización
"""
from __future__ import annotations

from app.services.financial_classifier import FinancialClassifier


def get_classifier(user_id: str, user_name: str) -> FinancialClassifier:
    return FinancialClassifier(user_id=user_id, user_name=user_name)


def transaction_to_classifier_row(t: dict) -> dict:
    """Mapea el dict interno de transacción al formato que espera predict()."""
    amount = t.get("amount", 0) or 0
    return {
        "Detalle": t.get("description", ""),
        "Tipos de Movimientos": "Creditos" if amount >= 0 else "Debitos",
        "Depósito": abs(amount) if amount >= 0 else 0,
        "Retiro": abs(amount) if amount < 0 else 0,
    }


def categorize_transactions(
    transactions: list[dict],
    user_id: str,
    user_name: str,
) -> list[dict]:
    """
    Categoriza una lista de transacciones usando el clasificador inteligente.

    Args:
        transactions : Lista de dicts producida por los parsers.
        user_id      : UUID del usuario (str).
        user_name    : Nombre completo para detectar transferencias propias.

    Returns:
        La misma lista con campos de categorización añadidos a cada transacción.
    """
    clf = get_classifier(user_id, user_name)
    result: list[dict] = []

    for t in transactions:
        row = transaction_to_classifier_row(t)
        cats, confidence, method = clf.predict(row)
        enriched = {**t}
        if cats:
            enriched["economic_type"] = cats.get("Economic Type")
            enriched["economic_type_detail"] = cats.get("Economic Type Detail")
            enriched["subtype_economic"] = cats.get("SubType Economic")
            enriched["budget_category"] = cats.get("Categoría de presupuesto")
            enriched["budget_role"] = cats.get("budget_role")
        enriched["confidence"] = confidence
        enriched["method"] = method
        result.append(enriched)

    return result
