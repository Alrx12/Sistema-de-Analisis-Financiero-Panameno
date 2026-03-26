"""
Motor de recomendaciones financieras de SAFPRO.

Módulo puro — no accede a la DB. Recibe los datos del análisis ya calculados
y retorna una lista de recomendaciones estructuradas.

Cada recomendación tiene:
  type:    "critical" | "warning" | "info" | "success"
  code:    identificador de máquina (el frontend puede renderizar íconos/colores por código)
  message: texto legible para el usuario en español
  data:    dict opcional con datos numéricos para el frontend

Reglas implementadas (en orden de severidad descendente):
  1.  no_income_detected         — sin ingresos y hay gastos
  2.  expenses_exceed_income     — gastos > ingresos
  3.  good_savings_rate          — ahorro >= 20% de los ingresos
  4.  top_expense_category       — la categoría que más dinero consumió
  5.  category_concentration     — una categoría > 50% del total de gastos
  6.  high_bank_charges          — cargos bancarios > 8% del total de gastos
  7.  high_unknown_spend         — gastos sin categorizar > 20% del total
  8.  recurring_spend_summary    — resumen de merchants recurrentes
  9.  low_confidence_transactions — N transacciones necesitan revisión
  10. merchant_price_increase     — merchant recurrente subió > 10% vs período anterior
  0.  all_clear                  — fallback si no hay ninguna alerta
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.services.detail_normalizer import canonicalize_detail

# ─────────────────────────────────────────────────────────────────────────────
# Umbrales
# ─────────────────────────────────────────────────────────────────────────────
_SAVINGS_RATE_GOOD = 0.20           # 20%+ ahorro → éxito
_CATEGORY_CONCENTRATION_WARN = 0.50  # 1 categoría > 50% del gasto → alerta
_BANK_CHARGES_WARN_PCT = 0.08       # cargos bancarios > 8% del gasto → alerta
_UNKNOWN_SPEND_WARN_PCT = 0.20      # gastos sin clasificar > 20% → info
_PRICE_INCREASE_THRESHOLD = 0.10    # 10% de aumento en merchant recurrente
_PRICE_INCREASE_MIN_ABS = 2.0       # diferencia mínima de $2 para alertar


def generate_recommendations(
    *,
    total_income: float,
    total_expenses: float,
    categories: dict[str, float],
    budget_roles: dict[str, float],
    low_confidence_count: int,
    categorized_transactions: list[dict[str, Any]],
    merchant_history: dict[str, list[float]] | None = None,
    user_goals: list[str] | None = None,
    expected_monthly_income: float | None = None,
) -> list[dict[str, Any]]:
    """
    Genera recomendaciones financieras a partir de los KPIs de un análisis.

    Args:
        total_income:             Suma de ingresos del período.
        total_expenses:           Suma de gastos del período (valor positivo).
        categories:               {categoría → monto} (excluye solo_balance).
        budget_roles:             {budget_role → monto}.
        low_confidence_count:     Transacciones con confidence < 0.8.
        categorized_transactions: Lista completa de transacciones categorizadas.
        merchant_history:         {merchant_key: [avg_snapshot_anterior, ...]}
                                  Si se pasa, habilita detección de aumento de precios.
        user_goals:               Lista de metas del usuario desde su perfil.
                                  Ej: ["fondo_emergencia", "eliminar_deuda"]
                                  Si se pasa, habilita reglas de metas personalizadas.
        expected_monthly_income:  Ingreso mensual esperado desde el perfil del usuario.
                                  Si se pasa, compara contra el ingreso real detectado.

    Returns:
        Lista ordenada de recomendaciones, de mayor a menor severidad.
        Cada elemento: {"type", "code", "message", "data"}.
    """
    recs: list[dict[str, Any]] = []

    # ── 1. Sin ingresos detectados ────────────────────────────────────────────
    if total_income == 0.0 and total_expenses > 0.0:
        recs.append({
            "type": "critical",
            "code": "no_income_detected",
            "message": (
                "No se detectaron ingresos en este período. "
                "Asegúrate de que el estado de cuenta incluya tus depósitos de salario."
            ),
            "data": {},
        })

    # ── 2. Gastos superan ingresos ────────────────────────────────────────────
    if total_income > 0.0 and total_expenses > total_income:
        deficit = round(total_expenses - total_income, 2)
        recs.append({
            "type": "warning",
            "code": "expenses_exceed_income",
            "message": f"Tus gastos superan tus ingresos en ${deficit:,.2f} en este período.",
            "data": {"deficit": deficit},
        })

    # ── 3. Tasa de ahorro positiva ────────────────────────────────────────────
    if total_income > 0.0:
        savings = total_income - total_expenses
        savings_rate = savings / total_income
        if savings_rate >= _SAVINGS_RATE_GOOD:
            recs.append({
                "type": "success",
                "code": "good_savings_rate",
                "message": (
                    f"Ahorraste el {savings_rate * 100:.1f}% de tus ingresos "
                    f"(${savings:,.2f}). ¡Buen ritmo!"
                ),
                "data": {
                    "savings_rate_pct": round(savings_rate * 100, 1),
                    "savings_amount": round(savings, 2),
                },
            })

    # ── 4. Categoría de mayor gasto ───────────────────────────────────────────
    expense_cats = {k: v for k, v in categories.items() if v > 0}
    if expense_cats and total_expenses > 0.0:
        top_cat = max(expense_cats, key=lambda k: expense_cats[k])
        top_amount = expense_cats[top_cat]
        top_pct = round(top_amount / total_expenses * 100, 1)
        recs.append({
            "type": "info",
            "code": "top_expense_category",
            "message": (
                f"Tu mayor gasto fue en '{top_cat}': "
                f"${top_amount:,.2f} ({top_pct}% del total)."
            ),
            "data": {
                "category": top_cat,
                "amount": round(top_amount, 2),
                "pct": top_pct,
            },
        })

    # ── 5. Concentración excesiva en una categoría ────────────────────────────
    if expense_cats and total_expenses > 0.0:
        for cat, amount in sorted(expense_cats.items(), key=lambda x: x[1], reverse=True):
            pct = amount / total_expenses
            if pct > _CATEGORY_CONCENTRATION_WARN:
                recs.append({
                    "type": "warning",
                    "code": "category_concentration",
                    "message": (
                        f"El {pct * 100:.1f}% de tus gastos está concentrado en '{cat}'. "
                        "Considera si hay oportunidad de optimizar esa categoría."
                    ),
                    "data": {
                        "category": cat,
                        "amount": round(amount, 2),
                        "pct": round(pct * 100, 1),
                    },
                })
                break  # Solo la primera (ya es la mayor por el sort)

    # ── 6. Cargos bancarios excesivos ─────────────────────────────────────────
    bank_charges = budget_roles.get("gasto_financiero", 0.0)
    if total_expenses > 0.0 and bank_charges / total_expenses > _BANK_CHARGES_WARN_PCT:
        pct = round(bank_charges / total_expenses * 100, 1)
        recs.append({
            "type": "warning",
            "code": "high_bank_charges",
            "message": (
                f"Los cargos bancarios (comisiones, ITBMS, etc.) representan el {pct}% "
                f"de tus gastos: ${bank_charges:,.2f}."
            ),
            "data": {"amount": round(bank_charges, 2), "pct": pct},
        })

    # ── 7. Alto porcentaje de gastos sin clasificar ───────────────────────────
    revisar_amount = budget_roles.get("revisar", 0.0)
    otros_amount = categories.get("otros", 0.0)
    # Usar el mayor de los dos para evitar doble conteo (pueden solapar)
    unknown_total = max(revisar_amount, otros_amount)
    if total_expenses > 0.0 and unknown_total / total_expenses > _UNKNOWN_SPEND_WARN_PCT:
        pct = round(unknown_total / total_expenses * 100, 1)
        recs.append({
            "type": "info",
            "code": "high_unknown_spend",
            "message": (
                f"El {pct}% de tus gastos está sin categorizar (${unknown_total:,.2f}). "
                "Usa /learn para entrenar el sistema y reducir este número."
            ),
            "data": {"amount": round(unknown_total, 2), "pct": pct},
        })

    # ── 8. Resumen de gastos recurrentes ──────────────────────────────────────
    recurrentes = _get_recurring_merchants(categorized_transactions)
    if recurrentes:
        total_rec = sum(v["total"] for v in recurrentes.values())
        top_merchants = sorted(
            recurrentes.items(), key=lambda x: x[1]["total"], reverse=True
        )[:5]
        top_names = ", ".join(k for k, _ in top_merchants)
        recs.append({
            "type": "info",
            "code": "recurring_spend_summary",
            "message": (
                f"Tienes ${total_rec:,.2f} en gastos recurrentes "
                f"({len(recurrentes)} merchants activos). "
                f"Principales: {top_names}."
            ),
            "data": {
                "total": round(total_rec, 2),
                "merchant_count": len(recurrentes),
                "top_merchants": [
                    {
                        "merchant": k,
                        "total": round(v["total"], 2),
                        "tx_count": v["count"],
                    }
                    for k, v in top_merchants
                ],
            },
        })

    # ── 9. Transacciones de baja confianza ────────────────────────────────────
    if low_confidence_count > 0:
        recs.append({
            "type": "info",
            "code": "low_confidence_transactions",
            "message": (
                f"{low_confidence_count} transacción(es) tienen clasificación de baja confianza. "
                "Revísalas con ?requires_review=true y usa /reclassify para corregirlas."
            ),
            "data": {"count": low_confidence_count},
        })

    # ── 10. Detección de aumento de precios en recurrentes ────────────────────
    if merchant_history and recurrentes:
        for increase in _detect_price_increases(recurrentes, merchant_history):
            recs.append({
                "type": "warning",
                "code": "merchant_price_increase",
                "message": (
                    f"'{increase['merchant']}' subió de ${increase['prev_avg']:,.2f} "
                    f"a ${increase['curr_avg']:,.2f} ({increase['pct_change']:+.1f}% vs período anterior)."
                ),
                "data": increase,
            })

    # ── 11–13. Reglas basadas en metas del perfil ─────────────────────────────
    if user_goals:
        goals_set = set(user_goals)
        savings = total_income - total_expenses if total_income > 0 else 0.0
        savings_rate = savings / total_income if total_income > 0 else 0.0

        # 11. Meta: fondo de emergencia — si ahorra menos de 1 mes de gastos
        if "fondo_emergencia" in goals_set and total_expenses > 0:
            # Un fondo de emergencia = 3–6 meses de gastos. Aquí alertamos si el
            # ahorro actual (este período) ni siquiera cubre 1 mes de gastos.
            if savings < total_expenses:
                target = round(total_expenses * 3, 2)
                recs.append({
                    "type": "warning",
                    "code": "goal_emergency_fund",
                    "message": (
                        f"Tu meta es construir un fondo de emergencia. "
                        f"Un fondo sólido cubre 3 meses de gastos (≈${target:,.2f}). "
                        f"Este período ahorraste ${max(savings, 0):,.2f}. "
                        "Considera automatizar un depósito fijo mensual a una cuenta separada."
                    ),
                    "data": {
                        "savings": round(savings, 2),
                        "target_3_months": target,
                        "monthly_expenses": round(total_expenses, 2),
                    },
                })

        # 12. Meta: eliminar deuda — si hay cargos financieros significativos
        if "eliminar_deuda" in goals_set:
            bank_charges = budget_roles.get("gasto_financiero", 0.0)
            if bank_charges > 0:
                recs.append({
                    "type": "info",
                    "code": "goal_debt_payment",
                    "message": (
                        f"Tu meta es eliminar deuda. Este período pagaste ${bank_charges:,.2f} "
                        "en cargos financieros (intereses, comisiones). "
                        "Prioriza pagar primero la deuda con la tasa más alta — "
                        "cada dólar en intereses es dinero que no trabaja para ti."
                    ),
                    "data": {"bank_charges": round(bank_charges, 2)},
                })

        # 13. Meta: ahorro general — si la tasa de ahorro está por debajo del 20%
        if "ahorro_general" in goals_set and total_income > 0:
            if savings_rate < _SAVINGS_RATE_GOOD:
                deficit_pct = round((_SAVINGS_RATE_GOOD - savings_rate) * 100, 1)
                deficit_amt = round(_SAVINGS_RATE_GOOD * total_income - savings, 2)
                recs.append({
                    "type": "info",
                    "code": "goal_savings_gap",
                    "message": (
                        f"Tu meta de ahorro es el 20% de tus ingresos. "
                        f"Este período ahorraste el {savings_rate * 100:.1f}% "
                        f"(te faltan {deficit_pct}pp = ${deficit_amt:,.2f} para alcanzar la meta). "
                        "Revisa tus categorías de gasto para encontrar dónde recortar."
                    ),
                    "data": {
                        "current_rate_pct": round(savings_rate * 100, 1),
                        "target_rate_pct": 20.0,
                        "gap_pct": deficit_pct,
                        "gap_amount": deficit_amt,
                    },
                })

    # ── 14. Ingreso real vs ingreso esperado del perfil ───────────────────────
    if expected_monthly_income and expected_monthly_income > 0 and total_income > 0:
        ratio = total_income / expected_monthly_income
        # Solo alertar si el ingreso real es < 80% del esperado (diferencia material)
        if ratio < 0.80:
            gap = round(expected_monthly_income - total_income, 2)
            recs.append({
                "type": "warning",
                "code": "income_below_expected",
                "message": (
                    f"Tu ingreso detectado (${total_income:,.2f}) es "
                    f"{round((1 - ratio) * 100, 1)}% menor que tu ingreso esperado "
                    f"(${expected_monthly_income:,.2f}). "
                    "Verifica que el estado de cuenta incluya todos tus depósitos, "
                    "o actualiza tu ingreso esperado en tu perfil."
                ),
                "data": {
                    "actual_income": round(total_income, 2),
                    "expected_income": round(expected_monthly_income, 2),
                    "gap": gap,
                    "ratio_pct": round(ratio * 100, 1),
                },
            })

    # ── Fallback: sin alertas ─────────────────────────────────────────────────
    if not recs:
        recs.append({
            "type": "success",
            "code": "all_clear",
            "message": "No se detectaron alertas. Tus finanzas del período están en orden.",
            "data": {},
        })

    return recs


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────────────────────

def _get_recurring_merchants(
    transactions: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    Extrae merchants recurrentes (subtype_economic == 'recurrente') de la lista.
    Retorna {canonical_key: {total, count, avg}}.
    """
    merchants: dict[str, dict[str, Any]] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for tx in transactions:
        if (tx.get("subtype_economic") or "").lower() != "recurrente":
            continue
        amount = abs(float(tx.get("amount", 0) or 0))
        if amount <= 0:
            continue
        raw = (tx.get("description") or tx.get("detail") or "").strip()
        if not raw:
            continue
        key = canonicalize_detail(raw)
        if key:
            merchants[key]["total"] += amount
            merchants[key]["count"] += 1

    result: dict[str, dict[str, Any]] = {}
    for k, v in merchants.items():
        result[k] = {
            "total": round(v["total"], 2),
            "count": v["count"],
            "avg": round(v["total"] / v["count"], 2) if v["count"] > 0 else 0.0,
        }
    return result


def _detect_price_increases(
    current_merchants: dict[str, dict[str, Any]],
    merchant_history: dict[str, list[float]],
) -> list[dict[str, Any]]:
    """
    Compara montos actuales de merchants recurrentes contra su historial.
    Retorna lista de merchants con aumentos significativos.

    merchant_history: {merchant_key: [avg_snapshot_más_viejo, ..., avg_snapshot_más_reciente]}
    El último elemento de la lista es el período inmediatamente anterior al actual.
    """
    increases = []
    for merchant, current in current_merchants.items():
        history = merchant_history.get(merchant)
        if not history:
            continue
        prev_avg = history[-1]  # Snapshot más reciente disponible en el historial
        curr_avg = current["avg"]
        if prev_avg <= 0:
            continue
        pct_change = (curr_avg - prev_avg) / prev_avg
        abs_change = curr_avg - prev_avg
        if pct_change > _PRICE_INCREASE_THRESHOLD and abs_change > _PRICE_INCREASE_MIN_ABS:
            increases.append({
                "merchant": merchant,
                "prev_avg": round(prev_avg, 2),
                "curr_avg": round(curr_avg, 2),
                "pct_change": round(pct_change * 100, 1),
                "abs_change": round(abs_change, 2),
            })
    return increases
