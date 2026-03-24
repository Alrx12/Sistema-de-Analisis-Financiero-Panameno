from __future__ import annotations

import unicodedata
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_transaction import AnalysisTransaction
from app.models.user import User
from app.services.categorization_service import categorize_transactions


_BALANCE_ONLY_ROLES = {"solo_balance"}


class AnalysisService:
    def __init__(self, db: Session):
        self.db = db

    def _parse_txn_date(self, value: Any) -> date | None:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            try:
                return date.fromisoformat(value[:10])
            except ValueError:
                return None
        return None

    def build_analysis(
        self,
        transactions: list[dict[str, Any]],
        user_id: str,
        user_name: str,
    ) -> dict[str, Any]:
        categorized_transactions = categorize_transactions(transactions, user_id, user_name)

        total_income = 0.0
        total_expenses = 0.0
        categories: dict[str, float] = defaultdict(float)
        budget_roles: dict[str, float] = defaultdict(float)
        low_confidence: list[dict[str, Any]] = []
        period_start: date | None = None
        period_end: date | None = None

        for t in categorized_transactions:
            amount = float(t.get("amount", 0) or 0)
            budget_role = (t.get("budget_role") or "revisar").lower().strip()
            raw_cat = (t.get("budget_category") or t.get("category") or "otros").lower().strip()
            # Normalizar acentos para evitar claves duplicadas ("alimentación" == "alimentacion")
            budget_cat = unicodedata.normalize("NFD", raw_cat).encode("ascii", "ignore").decode("ascii")
            confidence = float(t.get("confidence", 1.0) or 1.0)

            if budget_role not in _BALANCE_ONLY_ROLES:
                if amount >= 0:
                    total_income += amount
                else:
                    total_expenses += abs(amount)
                # Las categorías solo acumulan transacciones que cuentan en los totales.
                # solo_balance (transferencias entre cuentas propias) se excluye para mantener
                # consistencia: si no aparece en totales, no debe aparecer en categories.
                categories[budget_cat] += abs(amount)

            budget_roles[budget_role] += abs(amount)

            if confidence < 0.6:
                low_confidence.append(
                    {
                        "description": t.get("description") or t.get("detail"),
                        "amount": amount,
                        "confidence": round(confidence, 2),
                        "method": t.get("method"),
                    }
                )

            txn_date = self._parse_txn_date(t.get("transaction_date"))
            if txn_date is not None:
                if period_start is None or txn_date < period_start:
                    period_start = txn_date
                if period_end is None or txn_date > period_end:
                    period_end = txn_date

        recommendations: list[dict[str, Any]] = []

        if total_expenses > total_income:
            recommendations.append(
                {
                    "type": "warning",
                    "message": "Tus gastos superan tus ingresos en el período analizado.",
                }
            )

        if low_confidence:
            recommendations.append(
                {
                    "type": "info",
                    "message": (
                        f"{len(low_confidence)} transacción(es) quedaron con baja confianza "
                        "y requieren revisión manual."
                    ),
                }
            )

        if not recommendations:
            recommendations.append(
                {
                    "type": "info",
                    "message": "No se detectaron alertas críticas en el análisis.",
                }
            )

        return {
            "total_transactions": len(categorized_transactions),
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "balance": round(total_income - total_expenses, 2),
            "categories": {k: round(v, 2) for k, v in categories.items()},
            "budget_roles": {k: round(v, 2) for k, v in budget_roles.items()},
            "low_confidence": low_confidence,
            "recommendations": recommendations,
            "period_start": period_start.isoformat() if period_start else None,
            "period_end": period_end.isoformat() if period_end else None,
            "transactions": categorized_transactions,
        }

    def save_snapshot(
        self,
        analysis: dict[str, Any],
        current_user: User,
    ) -> AnalysisSnapshot:
        # Excluir "transactions" del summary JSON:
        # 1) Los datetime objects no son JSON-serializables → TypeError en PostgreSQL.
        # 2) Las transacciones se persisten por separado en analysis_transactions.
        summary_data = {k: v for k, v in analysis.items() if k != "transactions"}
        snapshot = AnalysisSnapshot(
            user_id=current_user.user_id,
            summary=summary_data,
            category_analysis=analysis.get("categories"),
            recommendations=analysis.get("recommendations"),
            period_start=(
                date.fromisoformat(analysis["period_start"])
                if analysis.get("period_start")
                else None
            ),
            period_end=(
                date.fromisoformat(analysis["period_end"])
                if analysis.get("period_end")
                else None
            ),
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def save_transactions(
        self,
        snapshot_id,
        user_id,
        transactions: list[dict[str, Any]],
    ) -> None:
        objs: list[AnalysisTransaction] = []

        for t in transactions:
            amount = float(t.get("amount", 0) or 0)

            obj = AnalysisTransaction(
                snapshot_id=snapshot_id,
                user_id=user_id,
                date=self._parse_txn_date(t.get("transaction_date")),
                detail=(t.get("description") or t.get("detail") or "").strip(),
                amount=amount,
                movement_type="credit" if amount >= 0 else "debit",
                economic_type=t.get("economic_type"),
                subtype_economic=t.get("subtype_economic"),
                transaction_category=t.get("transaction_category"),
                budget_category=t.get("budget_category"),
                budget_role=t.get("budget_role"),
                confidence=float(t.get("confidence", 0) or 0),
                method=t.get("method", ""),
            )
            objs.append(obj)

        if objs:
            self.db.add_all(objs)
            self.db.commit()