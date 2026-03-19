from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.user import User


class AnalysisService:
    def __init__(self, db: Session):
        self.db = db

    def build_analysis(self, transactions: list[dict[str, Any]]) -> dict[str, Any]:
        total_income = 0.0
        total_expenses = 0.0
        categories: dict[str, float] = defaultdict(float)
        period_start: date | None = None
        period_end: date | None = None

        for transaction in transactions:
            amount = float(transaction["amount"])
            if amount >= 0:
                total_income += amount
            else:
                total_expenses += abs(amount)
            categories[transaction["category"]] += abs(amount)

            transaction_date = transaction["transaction_date"].date()
            if period_start is None or transaction_date < period_start:
                period_start = transaction_date
            if period_end is None or transaction_date > period_end:
                period_end = transaction_date

        recommendations: list[dict[str, Any]] = []
        if total_expenses > total_income:
            recommendations.append(
                {"type": "warning", "message": "Tus gastos superan tus ingresos en el período analizado."}
            )
        if not recommendations:
            recommendations.append({"type": "info", "message": "No se detectaron alertas críticas en el análisis."})

        return {
            "total_transactions": len(transactions),
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "balance": round(total_income - total_expenses, 2),
            "categories": {key: round(value, 2) for key, value in categories.items()},
            "recommendations": recommendations,
            "period_start": period_start.isoformat() if period_start else None,
            "period_end": period_end.isoformat() if period_end else None,
        }

    def save_snapshot(self, analysis: dict[str, Any], current_user: User) -> AnalysisSnapshot:
        snapshot = AnalysisSnapshot(
            user_id=current_user.user_id,
            summary=analysis,
            category_analysis=analysis.get("categories"),
            recommendations=analysis.get("recommendations"),
            period_start=date.fromisoformat(analysis["period_start"]) if analysis.get("period_start") else None,
            period_end=date.fromisoformat(analysis["period_end"]) if analysis.get("period_end") else None,
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot