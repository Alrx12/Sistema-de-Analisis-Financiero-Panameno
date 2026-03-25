"""
Feature Engineering Service para SAFPRO.

Módulo puro — no accede a la DB. Recibe la lista de transacciones de un snapshot
(ya persistidas, como dicts) y computa agregaciones y métricas derivadas.

Features generadas:
  by_week               — ingresos/gastos/balance por semana ISO
  by_day_of_week        — gasto promedio por día de la semana
  spending_velocity     — velocidad de gasto: promedio diario, proyección mensual,
                          curva acumulada
  category_ratios       — porcentaje del gasto total por categoría
  merchant_concentration — top 10 merchants por monto gastado
  recurrence_stats      — breakdown recurrente vs extraordinario
  income_stats          — fuentes de ingreso y totales

Los dicts de transacción deben tener al menos estos campos (del modelo AnalysisTransaction):
  amount, date, budget_role, budget_category, subtype_economic, detail,
  economic_type_detail
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from app.services.detail_normalizer import canonicalize_detail

# Nombres de días en español (lunes=0 … domingo=6)
_WEEKDAYS_ES = [
    "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"
]

_BALANCE_ONLY_ROLES = {"solo_balance"}


def compute_features(
    transactions: list[dict[str, Any]],
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    """
    Computa todas las features de ingeniería financiera para un snapshot.

    Args:
        transactions: Lista de transacciones como dicts.
                      Campos esperados: amount, date, budget_role, budget_category,
                      subtype_economic, detail, economic_type_detail.
        period_start: Fecha inicio del período (opcional, se infiere de los datos).
        period_end:   Fecha fin del período (opcional, se infiere de los datos).

    Returns:
        Dict con todas las features computadas. Listo para serializar a JSON.
    """
    # Separar en gastos e ingresos (excluir solo_balance en ambos casos)
    expenses = [
        t for t in transactions
        if float(t.get("amount", 0) or 0) < 0
        and (t.get("budget_role") or "").lower() not in _BALANCE_ONLY_ROLES
    ]
    incomes = [
        t for t in transactions
        if float(t.get("amount", 0) or 0) >= 0
        and (t.get("budget_role") or "").lower() not in _BALANCE_ONLY_ROLES
    ]

    return {
        "by_week": _by_week(transactions),
        "by_day_of_week": _by_day_of_week(expenses),
        "spending_velocity": _spending_velocity(expenses, period_start, period_end),
        "category_ratios": _category_ratios(expenses),
        "merchant_concentration": _merchant_concentration(expenses),
        "recurrence_stats": _recurrence_stats(expenses),
        "income_stats": _income_stats(incomes),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _by_week(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa ingresos y gastos por semana ISO (formato '2025-W03')."""
    weeks: dict[str, dict[str, float]] = defaultdict(
        lambda: {"income": 0.0, "expenses": 0.0}
    )
    for t in transactions:
        if (t.get("budget_role") or "").lower() in _BALANCE_ONLY_ROLES:
            continue
        txn_date = _parse_date(t.get("date") or t.get("transaction_date"))
        if txn_date is None:
            continue
        week_key = txn_date.strftime("%G-W%V")  # ISO 8601 week
        amount = float(t.get("amount", 0) or 0)
        if amount >= 0:
            weeks[week_key]["income"] += amount
        else:
            weeks[week_key]["expenses"] += abs(amount)

    return [
        {
            "week": k,
            "income": round(v["income"], 2),
            "expenses": round(v["expenses"], 2),
            "balance": round(v["income"] - v["expenses"], 2),
        }
        for k, v in sorted(weeks.items())
    ]


def _by_day_of_week(expense_txns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Gasto promedio por día de la semana.

    avg_per_occurrence = total gastado ese día-de-semana / número de veces
    que ese día-de-semana apareció en el período.
    """
    day_totals: dict[int, float] = defaultdict(float)
    day_dates: dict[int, set[date]] = defaultdict(set)

    for t in expense_txns:
        txn_date = _parse_date(t.get("date") or t.get("transaction_date"))
        if txn_date is None:
            continue
        dow = txn_date.weekday()  # 0=lunes, 6=domingo
        amount = abs(float(t.get("amount", 0) or 0))
        day_totals[dow] += amount
        day_dates[dow].add(txn_date)

    return [
        {
            "day_index": i,
            "day": name,
            "total_spend": round(day_totals.get(i, 0.0), 2),
            "avg_per_occurrence": (
                round(day_totals[i] / len(day_dates[i]), 2)
                if day_dates.get(i) else 0.0
            ),
            "occurrence_count": len(day_dates.get(i, set())),
        }
        for i, name in enumerate(_WEEKDAYS_ES)
    ]


def _spending_velocity(
    expense_txns: list[dict[str, Any]],
    period_start: date | None,
    period_end: date | None,
) -> dict[str, Any]:
    """
    Velocidad de gasto del período:
      avg_daily_spend   — promedio de gasto por día calendario del período
      projected_monthly — extrapolación a 30 días
      period_days       — duración del período en días
      cumulative        — lista de puntos {date, daily_spend, cumulative} para graficar
                          la curva de gasto acumulado (solo días con transacciones)
    """
    empty = {"avg_daily_spend": 0.0, "projected_monthly": 0.0, "period_days": 0, "cumulative": []}
    if not expense_txns:
        return empty

    daily: dict[date, float] = defaultdict(float)
    for t in expense_txns:
        txn_date = _parse_date(t.get("date") or t.get("transaction_date"))
        if txn_date is None:
            continue
        daily[txn_date] += abs(float(t.get("amount", 0) or 0))

    if not daily:
        return empty

    start = period_start or min(daily.keys())
    end = period_end or max(daily.keys())
    period_days = max((end - start).days + 1, 1)

    total_expenses = sum(daily.values())
    avg_daily = total_expenses / period_days

    # Curva acumulada — solo días con transacciones para no inflar el payload
    cumulative = []
    running = 0.0
    for d in sorted(daily.keys()):
        running += daily[d]
        cumulative.append({
            "date": d.isoformat(),
            "daily_spend": round(daily[d], 2),
            "cumulative": round(running, 2),
        })

    return {
        "avg_daily_spend": round(avg_daily, 2),
        "projected_monthly": round(avg_daily * 30, 2),
        "period_days": period_days,
        "cumulative": cumulative,
    }


def _category_ratios(expense_txns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """% del gasto total por categoría, ordenado de mayor a menor."""
    cats: dict[str, dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "tx_count": 0})
    total = 0.0

    for t in expense_txns:
        amount = abs(float(t.get("amount", 0) or 0))
        cat = (t.get("budget_category") or "otros").lower().strip()
        cats[cat]["amount"] += amount
        cats[cat]["tx_count"] += 1
        total += amount

    return [
        {
            "category": cat,
            "amount": round(data["amount"], 2),
            "pct": round(data["amount"] / total * 100, 1) if total > 0 else 0.0,
            "tx_count": data["tx_count"],
        }
        for cat, data in sorted(cats.items(), key=lambda x: x[1]["amount"], reverse=True)
    ]


def _merchant_concentration(expense_txns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Top 10 merchants por monto gastado."""
    merchants: dict[str, dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "tx_count": 0})
    total = 0.0

    for t in expense_txns:
        raw = (t.get("detail") or "").strip()
        if not raw:
            continue
        key = canonicalize_detail(raw) or raw[:30]
        amount = abs(float(t.get("amount", 0) or 0))
        merchants[key]["amount"] += amount
        merchants[key]["tx_count"] += 1
        total += amount

    top = sorted(merchants.items(), key=lambda x: x[1]["amount"], reverse=True)[:10]
    return [
        {
            "merchant": k,
            "amount": round(v["amount"], 2),
            "pct_of_expenses": round(v["amount"] / total * 100, 1) if total > 0 else 0.0,
            "tx_count": v["tx_count"],
        }
        for k, v in top
    ]


def _recurrence_stats(expense_txns: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Breakdown de subtype_economic en gastos.
    Resalta recurrente vs extraordinario, con desglose completo de todos los subtipos.
    """
    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    total = 0.0

    for t in expense_txns:
        subtype = (t.get("subtype_economic") or "desconocido").lower()
        amount = abs(float(t.get("amount", 0) or 0))
        totals[subtype] += amount
        counts[subtype] += 1
        total += amount

    breakdown = [
        {
            "subtype": subtype,
            "amount": round(totals[subtype], 2),
            "pct": round(totals[subtype] / total * 100, 1) if total > 0 else 0.0,
            "tx_count": counts[subtype],
        }
        for subtype in sorted(totals.keys())
    ]

    recurrente = totals.get("recurrente", 0.0)
    extraordinario = totals.get("extraordinario", 0.0)
    return {
        "recurrente_total": round(recurrente, 2),
        "recurrente_pct": round(recurrente / total * 100, 1) if total > 0 else 0.0,
        "extraordinario_total": round(extraordinario, 2),
        "extraordinario_pct": round(extraordinario / total * 100, 1) if total > 0 else 0.0,
        "breakdown": breakdown,
    }


def _income_stats(income_txns: list[dict[str, Any]]) -> dict[str, Any]:
    """Fuentes de ingreso y montos."""
    sources: dict[str, float] = defaultdict(float)
    total = 0.0

    for t in income_txns:
        amount = float(t.get("amount", 0) or 0)
        source = (t.get("economic_type_detail") or "otros_ingresos").lower()
        sources[source] += amount
        total += amount

    return {
        "total": round(total, 2),
        "sources": {
            k: round(v, 2)
            for k, v in sorted(sources.items(), key=lambda x: x[1], reverse=True)
        },
    }
