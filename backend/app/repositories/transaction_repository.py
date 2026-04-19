"""
transaction_repository.py — Repositorio de acceso a datos para AnalysisTransaction.

Encapsula todas las queries sobre analysis_transactions para que
los endpoints y servicios no repitan lógica de filtrado.

Uso típico:
    repo = TransactionRepository(db)
    tx = repo.get_by_id_for_user(transaction_id, user_id)
    pending = repo.list_requiring_review(user_id)
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from app.models.analysis_transaction import AnalysisTransaction


class TransactionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Lectura individual ──────────────────────────────────────────────────

    def get_by_id_for_user(
        self,
        transaction_id: UUID,
        user_id: UUID,
    ) -> AnalysisTransaction | None:
        """Retorna la transacción si existe y pertenece al usuario, None si no."""
        return self.db.scalar(
            select(AnalysisTransaction).where(
                AnalysisTransaction.transaction_id == transaction_id,
                AnalysisTransaction.user_id == user_id,
            )
        )

    # ── Listados por snapshot ───────────────────────────────────────────────

    def list_by_snapshot(
        self,
        snapshot_id: UUID,
        user_id: UUID,
    ) -> list[AnalysisTransaction]:
        """Todas las transacciones de un snapshot, verificando ownership."""
        return list(
            self.db.scalars(
                select(AnalysisTransaction)
                .where(
                    AnalysisTransaction.snapshot_id == snapshot_id,
                    AnalysisTransaction.user_id == user_id,
                )
                .order_by(AnalysisTransaction.date.desc())
            ).all()
        )

    def list_by_snapshot_filtered(
        self,
        snapshot_id: UUID,
        user_id: UUID,
        *,
        max_confidence: float | None = None,
        budget_role: str | None = None,
        economic_type: str | None = None,
        requires_review: bool | None = None,
    ) -> list[AnalysisTransaction]:
        """Listado con filtros opcionales. Todos los parámetros son AND."""
        stmt = select(AnalysisTransaction).where(
            AnalysisTransaction.snapshot_id == snapshot_id,
            AnalysisTransaction.user_id == user_id,
        )

        if max_confidence is not None:
            stmt = stmt.where(AnalysisTransaction.confidence <= max_confidence)

        if budget_role is not None:
            stmt = stmt.where(AnalysisTransaction.budget_role == budget_role)

        if economic_type is not None:
            stmt = stmt.where(AnalysisTransaction.economic_type == economic_type)

        if requires_review is True:
            stmt = stmt.where(
                AnalysisTransaction.method != "user_reclassified",
                or_(
                    AnalysisTransaction.confidence < 0.8,
                    AnalysisTransaction.budget_role == "revisar",
                    AnalysisTransaction.budget_category.ilike("%desconocido%"),
                    AnalysisTransaction.budget_category == "otros",
                ),
            )

        return list(
            self.db.scalars(stmt.order_by(AnalysisTransaction.date.desc())).all()
        )

    # ── Transacciones pendientes de revisión ────────────────────────────────

    def list_requiring_review(
        self,
        user_id: UUID,
        *,
        debits_only: bool = True,
    ) -> list[AnalysisTransaction]:
        """
        Transacciones con baja confianza, categoría 'revisar'/'otros',
        o descriptor desconocido — excluyendo las ya reclasificadas manualmente.

        Usado por /review-groups para agrupar los merchants pendientes.
        """
        stmt = select(AnalysisTransaction).where(
            AnalysisTransaction.user_id == user_id,
            or_(
                and_(
                    AnalysisTransaction.method != "user_reclassified",
                    or_(
                        AnalysisTransaction.confidence < 0.8,
                        AnalysisTransaction.budget_role == "revisar",
                        AnalysisTransaction.budget_category.ilike("%desconocido%"),
                    ),
                ),
                AnalysisTransaction.budget_category == "otros",
            ),
        )

        if debits_only:
            stmt = stmt.where(AnalysisTransaction.amount < 0)

        return list(self.db.scalars(stmt).all())

    # ── Bulk update ─────────────────────────────────────────────────────────

    def bulk_reclassify(
        self,
        transaction_ids: list[UUID],
        user_id: UUID,
        *,
        economic_type: str,
        economic_type_detail: str | None,
        subtype_economic: str | None,
        budget_category: str,
        budget_role: str,
    ) -> int:
        """
        Actualiza la clasificación de múltiples transacciones a la vez.
        Verifica que pertenezcan al usuario (condición AND en el WHERE).
        Retorna el número de filas realmente actualizadas.
        """
        result = self.db.execute(
            update(AnalysisTransaction)
            .where(
                AnalysisTransaction.transaction_id.in_(transaction_ids),
                AnalysisTransaction.user_id == user_id,
            )
            .values(
                economic_type=economic_type,
                economic_type_detail=economic_type_detail,
                subtype_economic=subtype_economic,
                budget_category=budget_category,
                budget_role=budget_role,
                confidence=1.0,
                method="user_reclassified",
                user_reclassified=True,
            )
        )
        self.db.commit()
        return result.rowcount

    # ── Estadísticas ────────────────────────────────────────────────────────

    def count_by_user(self, user_id: UUID) -> int:
        """Total de transacciones del usuario en todos sus snapshots."""
        from sqlalchemy import func  # local import to keep top-level clean

        return self.db.scalar(
            select(func.count(AnalysisTransaction.transaction_id)).where(
                AnalysisTransaction.user_id == user_id
            )
        ) or 0

    def count_requiring_review(self, user_id: UUID) -> int:
        """Número de transacciones pendientes de revisión."""
        return len(self.list_requiring_review(user_id))
