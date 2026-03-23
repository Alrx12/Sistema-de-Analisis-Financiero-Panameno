from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.user import User
from app.services.categorization_service import categorize_transactions

# budget_roles que NO deben contarse como ingreso/gasto real
_BALANCE_ONLY_ROLES = {"solo_balance"}


class AnalysisService:
    def __init__(self, db: Session):
        self.db = db

    def build_analysis(
        self,
        transactions: list[dict[str, Any]],
        user_id: str,
        user_name: str,
    ) -> dict[str, Any]:
        # ── Categorización inteligente ────────────────────────────────────────
        transactions = categorize_transactions(transactions, user_id, user_name)

        # ── Acumuladores ──────────────────────────────────────────────────────
        total_income = 0.0
        total_expenses = 0.0
        categories: dict[str, float] = defaultdict(float)
        budget_roles: dict[str, float] = defaultdict(float)
        low_confidence: list[dict[str, Any]] = []
        period_start: date | None = None
        period_end: date | None = None

        for t in transactions:
            amount = float(t["amount"])
            budget_role = t.get("budget_role") or "revisar"
            budget_cat  = t.get("budget_category") or t.get("category") or "otros"
            confidence  = t.get("confidence", 1.0) or 1.0

            # Solo suma a ingresos/gastos lo que no es transferencia propia
            if budget_role not in _BALANCE_ONLY_ROLES:
                if amount >= 0:
                    total_income += amount
                else:
                    total_expenses += abs(amount)

            categories[budget_cat] += abs(amount)
            budget_roles[budget_role] += abs(amount)

            if confidence < 0.6:
                low_confidence.append({
                    "description": t.get("description"),
                    "amount": amount,
                    "confidence": round(confidence, 2),
                    "method": t.get("method"),
                })

            txn_date = t["transaction_date"].date()
            if period_start is None or txn_date < period_start:
                period_start = txn_date
            if period_end is None or txn_date > period_end:
                period_end = txn_date

        # ── Recomendaciones ───────────────────────────────────────────────────
        recommendations: list[dict[str, Any]] = []

        if total_expenses > total_income:
            recommendations.append({
                "type": "warning",
                "message": "Tus gastos superan tus ingresos en el período analizado.",
            })

        if low_confidence:
            recommendations.append({
                "type": "info",
                "message": (
                    f"{len(low_confidence)} transacción(es) quedaron con baja confianza "
                    "y requieren revisión manual."
                ),
            })

        if not recommendations:
            recommendations.append({
                "type": "info",
                "message": "No se detectaron alertas críticas en el análisis.",
            })

        return {
            "total_transactions": len(transactions),
            "total_income":       round(total_income, 2),
            "total_expenses":     round(total_expenses, 2),
            "balance":            round(total_income - total_expenses, 2),
            "categories":         {k: round(v, 2) for k, v in categories.items()},
            "budget_roles":       {k: round(v, 2) for k, v in budget_roles.items()},
            "low_confidence":     low_confidence,
            "recommendations":    recommendations,
            "period_start":       period_start.isoformat() if period_start else None,
            "period_end":         period_end.isoformat() if period_end else None,
        }

    def save_snapshot(
        self,
        analysis: dict[str, Any],
        current_user: User,
    ) -> AnalysisSnapshot:
        snapshot = AnalysisSnapshot(
            user_id=current_user.user_id,
            summary=analysis,
            category_analysis=analysis.get("categories"),
            recommendations=analysis.get("recommendations"),
            period_start=(
                date.fromisoformat(analysis["period_start"])
                if analysis.get("period_start") else None
            ),
            period_end=(
                date.fromisoformat(analysis["period_end"])
                if analysis.get("period_end") else None
            ),
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot