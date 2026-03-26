from __future__ import annotations

import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_transaction import AnalysisTransaction
from app.models.user import User
from app.services.categorization_service import get_classifier, transaction_to_classifier_row
from app.services.categorization_service import categorize_transactions
from app.services.detail_normalizer import canonicalize_detail
from app.services.recommendation_engine import generate_recommendations


_BALANCE_ONLY_ROLES = {"solo_balance"}

# Tipos cuyo SubType no se sobreescribe por frecuencia (ya tienen un valor semántico fijo)
_SUBTYPE_KEEP_AS_IS = {"transferencia_propia", "transferencia_tercero"}

# Umbral de ocurrencias para considerar una transacción como recurrente dentro del archivo
_RECURRENTE_THRESHOLD = 3


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

    def _apply_subtype_auto_detection(
        self, categorized: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Segunda pasada sobre las transacciones ya categorizadas para asignar
        SubType Economic basado en frecuencia dentro del mismo archivo.

        Reglas:
          - cargo_financiero              → "financiero" (siempre, sin importar frecuencia)
          - transferencia_propia/tercero  → se conserva el valor del clasificador
          - Todo lo demás (gasto, ingreso, reembolso):
              · count >= _RECURRENTE_THRESHOLD → "recurrente"
              · count < _RECURRENTE_THRESHOLD  → "extraordinario"
            Excepción: si el método es builtin: y el SubType original no es
            "desconocido" ni "variable", se conserva (el builtin sabe más que
            la frecuencia, e.g. PLANILLA siempre es recurrente).
        """
        # Contar ocurrencias de cada clave canónica en el archivo
        freq: Counter[str] = Counter()
        for t in categorized:
            raw = (t.get("description") or t.get("detail") or "").strip()
            if raw:
                freq[canonicalize_detail(raw)] += 1

        result = []
        for t in categorized:
            tx = {**t}
            etype = (tx.get("economic_type") or "").lower()
            method = (tx.get("method") or "").lower()

            if etype == "cargo_financiero":
                tx["subtype_economic"] = "financiero"
            elif etype in _SUBTYPE_KEEP_AS_IS:
                pass  # conservar valor del clasificador
            else:
                # Solo sobreescribir subtypes "blandos"
                current_subtype = (tx.get("subtype_economic") or "").lower()
                is_soft = current_subtype in ("desconocido", "variable", "operativo", "")
                is_builtin = method.startswith("builtin:")
                if is_soft or not is_builtin:
                    raw = (tx.get("description") or tx.get("detail") or "").strip()
                    count = freq.get(canonicalize_detail(raw), 1) if raw else 1
                    tx["subtype_economic"] = (
                        "recurrente" if count >= _RECURRENTE_THRESHOLD else "extraordinario"
                    )

            result.append(tx)
        return result

    def build_analysis(
        self,
        transactions: list[dict[str, Any]],
        user_id: str,
        user_name: str,
    ) -> dict[str, Any]:
        categorized_transactions = self._apply_subtype_auto_detection(
            categorize_transactions(transactions, user_id, user_name)
        )

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

        merchant_history = self._get_merchant_history(user_id)
        recommendations = generate_recommendations(
            total_income=round(total_income, 2),
            total_expenses=round(total_expenses, 2),
            categories={k: round(v, 2) for k, v in categories.items()},
            budget_roles={k: round(v, 2) for k, v in budget_roles.items()},
            low_confidence_count=len(low_confidence),
            categorized_transactions=categorized_transactions,
            merchant_history=merchant_history,
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
        bank_account_id: UUID | None = None,
    ) -> AnalysisSnapshot:
        # --- UPSERT: si ya existe un snapshot para esta cuenta + mes, reemplazarlo ---
        # Solo aplica cuando tenemos bank_account_id y period_start conocidos.
        # Razón: el usuario puede corregir o re-exportar el mismo mes; el segundo upload
        # debe ganarle al primero, no acumularse encima.
        period_start_str = analysis.get("period_start")
        period_start_date: date | None = (
            date.fromisoformat(period_start_str) if period_start_str else None
        )

        if bank_account_id and period_start_date:
            existing = (
                self.db.query(AnalysisSnapshot)
                .filter(
                    AnalysisSnapshot.user_id == current_user.user_id,
                    AnalysisSnapshot.bank_account_id == bank_account_id,
                    extract("year", AnalysisSnapshot.period_start) == period_start_date.year,
                    extract("month", AnalysisSnapshot.period_start) == period_start_date.month,
                )
                .first()
            )
            if existing:
                # Borrar primero las transacciones (FK constraint)
                self.db.query(AnalysisTransaction).filter(
                    AnalysisTransaction.snapshot_id == existing.snapshot_id
                ).delete(synchronize_session=False)
                self.db.delete(existing)
                self.db.flush()

        # Excluir "transactions" del summary JSON:
        # 1) Los datetime objects no son JSON-serializables → TypeError en PostgreSQL.
        # 2) Las transacciones se persisten por separado en analysis_transactions.
        summary_data = {k: v for k, v in analysis.items() if k != "transactions"}
        snapshot = AnalysisSnapshot(
            user_id=current_user.user_id,
            bank_account_id=bank_account_id,
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
                economic_type_detail=t.get("economic_type_detail"),
                subtype_economic=t.get("subtype_economic"),
                budget_category=t.get("budget_category"),
                budget_role=t.get("budget_role"),
                confidence=float(t.get("confidence", 0) or 0),
                method=t.get("method", ""),
            )
            objs.append(obj)

        if objs:
            self.db.add_all(objs)
            self.db.commit()

    def _recalculate_snapshot_kpis(
        self,
        snapshot: AnalysisSnapshot,
        txns: list[AnalysisTransaction],
    ) -> None:
        """
        Recalcula los KPIs del snapshot a partir del estado actual de sus transacciones
        en DB y actualiza los campos summary, category_analysis, recommendations,
        period_start y period_end.
        """
        total_income = 0.0
        total_expenses = 0.0
        categories: dict[str, float] = defaultdict(float)
        budget_roles: dict[str, float] = defaultdict(float)
        low_confidence: list[dict[str, Any]] = []
        period_start: date | None = None
        period_end: date | None = None

        for tx in txns:
            amount = float(tx.amount)
            budget_role = (tx.budget_role or "revisar").lower().strip()
            raw_cat = (tx.budget_category or "otros").lower().strip()
            budget_cat = (
                unicodedata.normalize("NFD", raw_cat)
                .encode("ascii", "ignore")
                .decode("ascii")
            )
            confidence = float(tx.confidence)

            if budget_role not in _BALANCE_ONLY_ROLES:
                if amount >= 0:
                    total_income += amount
                else:
                    total_expenses += abs(amount)
                categories[budget_cat] += abs(amount)

            budget_roles[budget_role] += abs(amount)

            if confidence < 0.6:
                low_confidence.append(
                    {
                        "description": tx.detail,
                        "amount": amount,
                        "confidence": round(confidence, 2),
                        "method": tx.method,
                    }
                )

            if tx.date is not None:
                if period_start is None or tx.date < period_start:
                    period_start = tx.date
                if period_end is None or tx.date > period_end:
                    period_end = tx.date

        total_income = round(total_income, 2)
        total_expenses = round(total_expenses, 2)
        balance = round(total_income - total_expenses, 2)
        categories_rounded = {k: round(v, 2) for k, v in categories.items()}
        budget_roles_rounded = {k: round(v, 2) for k, v in budget_roles.items()}

        # Reconstruir lista de transacciones como dicts para pasarla al engine
        tx_dicts: list[dict[str, Any]] = [
            {
                "amount": float(tx.amount),
                "description": tx.detail,
                "detail": tx.detail,
                "budget_role": tx.budget_role,
                "budget_category": tx.budget_category,
                "subtype_economic": tx.subtype_economic,
                "economic_type": tx.economic_type,
                "confidence": float(tx.confidence),
                "method": tx.method,
            }
            for tx in txns
        ]
        merchant_history = self._get_merchant_history(
            snapshot.user_id, exclude_snapshot_id=snapshot.snapshot_id
        )
        recommendations = generate_recommendations(
            total_income=total_income,
            total_expenses=total_expenses,
            categories=categories_rounded,
            budget_roles=budget_roles_rounded,
            low_confidence_count=len(low_confidence),
            categorized_transactions=tx_dicts,
            merchant_history=merchant_history,
        )

        snapshot.summary = {
            "total_transactions": len(txns),
            "total_income": total_income,
            "total_expenses": total_expenses,
            "balance": balance,
            "categories": categories_rounded,
            "budget_roles": budget_roles_rounded,
            "low_confidence": low_confidence,
            "recommendations": recommendations,
            "period_start": period_start.isoformat() if period_start else None,
            "period_end": period_end.isoformat() if period_end else None,
        }
        snapshot.category_analysis = categories_rounded
        snapshot.recommendations = recommendations
        if period_start:
            snapshot.period_start = period_start
        if period_end:
            snapshot.period_end = period_end

        self.db.commit()

    def _get_merchant_history(
        self,
        user_id: str | UUID,
        exclude_snapshot_id: UUID | None = None,
        limit: int = 3,
    ) -> dict[str, list[float]]:
        """
        Devuelve el historial de montos promedio por merchant recurrente en los últimos
        N snapshots del usuario (excluyendo el snapshot actual si se indica).

        Retorna: {merchant_canonical_key: [avg_snapshot_más_viejo, ..., avg_más_reciente]}
        El último elemento de cada lista es el período inmediatamente anterior al actual.
        Se usa en generate_recommendations() para detectar aumentos de precio.
        """
        try:
            uid = UUID(str(user_id)) if not isinstance(user_id, UUID) else user_id
        except (ValueError, AttributeError):
            return {}

        try:
            snapshots = (
                self.db.query(AnalysisSnapshot)
                .filter(AnalysisSnapshot.user_id == uid)
                .order_by(AnalysisSnapshot.created_at.desc())
                .limit(limit + 1)
                .all()
            )
            if exclude_snapshot_id:
                snapshots = [s for s in snapshots if s.snapshot_id != exclude_snapshot_id]
            snapshots = snapshots[:limit]

            history: dict[str, list[float]] = defaultdict(list)
            # Invertir para ordenar de más antiguo a más reciente
            for snapshot in reversed(snapshots):
                txns = (
                    self.db.query(AnalysisTransaction)
                    .filter(
                        AnalysisTransaction.snapshot_id == snapshot.snapshot_id,
                        AnalysisTransaction.subtype_economic == "recurrente",
                    )
                    .all()
                )
                merchant_amounts: dict[str, list[float]] = defaultdict(list)
                for tx in txns:
                    if tx.detail:
                        key = canonicalize_detail(tx.detail)
                        if key:
                            merchant_amounts[key].append(abs(float(tx.amount)))

                for key, amounts in merchant_amounts.items():
                    history[key].append(sum(amounts) / len(amounts))

            return dict(history)
        except Exception:  # noqa: BLE001
            # Si el DB mock no soporta la query, o hay error de conexión, retornar vacío
            # para no romper el pipeline principal
            return {}

    def reclassify_snapshot(
        self,
        snapshot: AnalysisSnapshot,
        user: User,
        skip_user_reclassified: bool = True,
    ) -> dict[str, Any]:
        """
        Re-categoriza todas las transacciones del snapshot usando el KB actual.

        Flujo:
          1. Carga todas las transacciones del snapshot.
          2. Corre el clasificador sobre cada una (necesario para frecuencias correctas).
          3. Aplica _apply_subtype_auto_detection con el batch completo.
          4. Actualiza en DB solo las no protegidas.
          5. Recalcula los KPIs del snapshot.
          6. Retorna resumen: total, updated, skipped, requires_review.

        Args:
            snapshot              : El AnalysisSnapshot a re-procesar.
            user                  : El usuario dueño del snapshot.
            skip_user_reclassified: Si True, omite transacciones con method="user_reclassified".
        """
        # 1. Cargar transacciones
        txns: list[AnalysisTransaction] = (
            self.db.query(AnalysisTransaction)
            .filter(AnalysisTransaction.snapshot_id == snapshot.snapshot_id)
            .all()
        )

        if not txns:
            return {
                "snapshot_id": snapshot.snapshot_id,
                "total": 0,
                "updated": 0,
                "skipped": 0,
                "requires_review": 0,
            }

        # 2. Instanciar clasificador una sola vez para todo el batch
        clf = get_classifier(str(user.user_id), user.full_name or "")

        classified: list[dict[str, Any]] = []
        for tx in txns:
            row = transaction_to_classifier_row(
                {"description": tx.detail, "amount": float(tx.amount)}
            )
            cats, confidence, method = clf.predict(row)
            classified.append(
                {
                    # Campos que _apply_subtype_auto_detection necesita
                    "detail": tx.detail,
                    "description": tx.detail,
                    "amount": float(tx.amount),
                    "economic_type": cats.get("Economic Type") if cats else tx.economic_type,
                    "economic_type_detail": (
                        cats.get("Economic Type Detail") if cats else tx.economic_type_detail
                    ),
                    "subtype_economic": (
                        cats.get("SubType Economic") if cats else tx.subtype_economic
                    ),
                    "budget_category": (
                        cats.get("Categoría de presupuesto") if cats else tx.budget_category
                    ),
                    "budget_role": cats.get("budget_role") if cats else tx.budget_role,
                    "confidence": confidence,
                    "method": method,
                    # Referencia al objeto ORM para actualizar luego
                    "_tx_obj": tx,
                    "_is_manual": tx.method == "user_reclassified",
                }
            )

        # 3. Auto-detección de subtype por frecuencia en el batch completo
        classified = self._apply_subtype_auto_detection(classified)

        # 4. Actualizar DB
        updated = 0
        skipped = 0
        for item in classified:
            tx: AnalysisTransaction = item["_tx_obj"]
            if skip_user_reclassified and item["_is_manual"]:
                skipped += 1
                continue
            tx.economic_type = item["economic_type"]
            tx.economic_type_detail = item["economic_type_detail"]
            tx.subtype_economic = item["subtype_economic"]
            tx.budget_category = item["budget_category"]
            tx.budget_role = item["budget_role"]
            tx.confidence = item["confidence"]
            tx.method = item["method"]
            updated += 1

        self.db.commit()

        # 5. Recalcular KPIs del snapshot con el estado final de todas las transacciones
        # Re-consultar para que los objetos skipped reflejen sus valores reales en DB
        txns_final: list[AnalysisTransaction] = (
            self.db.query(AnalysisTransaction)
            .filter(AnalysisTransaction.snapshot_id == snapshot.snapshot_id)
            .all()
        )
        self._recalculate_snapshot_kpis(snapshot, txns_final)

        # 6. Contar cuántas siguen requiriendo revisión tras la reclasificación
        requires_review = sum(1 for tx in txns_final if float(tx.confidence) < 0.8)

        return {
            "snapshot_id": snapshot.snapshot_id,
            "total": len(txns_final),
            "updated": updated,
            "skipped": skipped,
            "requires_review": requires_review,
        }