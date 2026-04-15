import { type ReactNode, useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Upload, ArrowRight, BarChart2, Building2, Layers, ShoppingBag,
  TrendingUp as SavingsIcon, Activity, DollarSign,
} from "lucide-react"
import { listAnalysis, getAggregatedSummary } from "@/api/analysis"
import { getProfile } from "@/api/profile"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, capitalize } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ComposedChart, CartesianGrid, Line,
  Area, AreaChart, ReferenceLine, LabelList,
} from "recharts"
import type { AnalysisSnapshot, AggregatedSummary } from "@/types"

// ─── Paleta ──────────────────────────────────────────────────────────────────
const CAT_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"]

// Emojis por categoría para la vista de lista
const CAT_EMOJI: Record<string, string> = {
  alimentacion: "🛒", comida: "🛒", supermercado: "🛒", mercado: "🛒",
  restaurantes: "🍽️", restaurante: "🍽️", cafe: "☕",
  transporte: "🚗", gasolina: "⛽",
  servicios: "💡", servicios_basicos: "💡", agua: "💧", luz: "💡",
  internet: "📶", telefono: "📱",
  entretenimiento: "🎮", ocio: "🎭", streaming: "📺",
  salud: "🏥", farmacia: "💊",
  educacion: "📚",
  vivienda: "🏠", alquiler: "🏠", hipoteca: "🏠",
  tecnologia: "💻",
  suscripciones: "🔔", suscripcion: "🔔",
  mascotas: "🐾",
  ropa: "👕",
  deporte: "⚽", gym: "🏋️",
  belleza: "💅",
  viajes: "✈️", viaje: "✈️",
  bares: "🍺",
  ahorro: "🐖", inversion: "📈",
  deuda: "💳", deudas: "💳",
  cargo_financiero: "🏦", gasto_financiero: "🏦", financiero: "🏦",
  comision: "💰", impuesto: "📋",
  transferencias: "↔️",
  consumo_desconocido: "⚠️",
  otros: "📦",
}

const ETYPE_COLORS: Record<string, string> = {
  gasto:                "#ef4444",
  ingreso:              "#10b981",
  cargo_financiero:     "#f59e0b",
  transferencia_propia: "#94a3b8",
  transferencia_tercero:"#6366f1",
  reembolso:            "#06b6d4",
  desconocido:          "#d1d5db",
}

const BROLE_COLORS: Record<string, string> = {
  presupuestable:      "#10b981",
  no_presupuestable:   "#f97316",
  gasto_operativo:     "#3b82f6",
  gasto_financiero:    "#f59e0b",
  ahorro_inversion:    "#8b5cf6",
  revisar:             "#ef4444",
  solo_balance:        "#d1d5db",
}

const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  return new Date(s + "T12:00:00")
}
function getYear(s: AnalysisSnapshot, f: "period_start" | "period_end") {
  const d = parseDate(s[f]); return d ? d.getFullYear() : null
}
function getMonth(s: AnalysisSnapshot, f: "period_start" | "period_end") {
  const d = parseDate(s[f]); return d ? d.getMonth() + 1 : null
}

/** Parsea etiqueta de tendencia tipo "Sep 25" → { month: 9, year: 2025 } */
function parseTrendLabel(label: string): { month: number; year: number } | null {
  const parts = label.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const monthIdx = MONTH_NAMES.indexOf(parts[0])
  if (monthIdx === -1) return null
  const suffix = parseInt(parts[1])
  if (isNaN(suffix)) return null
  const year = suffix < 50 ? 2000 + suffix : 1900 + suffix
  return { month: monthIdx + 1, year }
}

function fmtK(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

// ─── Snapshot-level aggregate ─────────────────────────────────────────────────
function snapshotAggregate(snapshots: AnalysisSnapshot[]): Omit<AggregatedSummary, "top_merchants"|"by_economic_type"|"monthly_trend"> & { top_merchants: []; by_economic_type: []; monthly_trend: [] } {
  const total_income    = snapshots.reduce((s, x) => s + x.total_income, 0)
  const total_expenses  = snapshots.reduce((s, x) => s + x.total_expenses, 0)
  const total_transactions = snapshots.reduce((s, x) => s + x.total_transactions, 0)
  const categories: Record<string, number> = {}
  snapshots.forEach(s => {
    Object.entries(s.categories).forEach(([k, v]) => { categories[k] = (categories[k] ?? 0) + v })
  })
  return {
    total_income, total_expenses, balance: total_income - total_expenses,
    total_transactions, categories,
    top_merchants: [], by_economic_type: [], monthly_trend: [], by_budget_role: [],
  }
}

// ─── Tooltips custom ─────────────────────────────────────────────────────────
function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border/60 bg-white/95 px-3.5 py-2.5 shadow-lg text-xs backdrop-blur-sm">
      <p className="mb-2 font-semibold text-foreground/80 border-b border-border/40 pb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex justify-between gap-5 mt-1" style={{ color: p.color }}>
          <span className="font-medium">{p.name}</span>
          <span className="font-bold">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function BalanceTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  const isPos = val >= 0
  return (
    <div className="rounded-xl border border-border/60 bg-white/95 px-3.5 py-2.5 shadow-lg text-xs backdrop-blur-sm">
      <p className="mb-2 font-semibold text-foreground/80 border-b border-border/40 pb-1.5">{label}</p>
      <p className={`flex justify-between gap-5 mt-1 font-bold ${isPos ? "text-emerald-600" : "text-red-500"}`}>
        <span>Balance neto</span>
        <span>{formatCurrency(val)}</span>
      </p>
    </div>
  )
}

function SavingsTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-xl border border-border/60 bg-white/95 px-3.5 py-2.5 shadow-lg text-xs backdrop-blur-sm">
      <p className="mb-2 font-semibold text-foreground/80 border-b border-border/40 pb-1.5">{label}</p>
      <p className="flex justify-between gap-5 mt-1 font-bold text-violet-600">
        <span>Tasa de ahorro</span>
        <span>{val.toFixed(1)}%</span>
      </p>
    </div>
  )
}

// ─── Dot personalizado para la línea de gastos ────────────────────────────────
function ExpenseDot(props: { cx?: number; cy?: number; value?: number; showLabel?: boolean }) {
  const { cx = 0, cy = 0, value = 0, showLabel = false } = props
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="white" strokeWidth={2} />
      {showLabel && value > 0 && (
        <text x={cx} y={cy - 11} textAnchor="middle" fontSize={9} fill="#ef4444" fontWeight="600">
          {fmtK(value)}
        </text>
      )}
    </g>
  )
}

// ─── Dot para la línea de savings ────────────────────────────────────────────
function SavingsDot(props: { cx?: number; cy?: number; value?: number }) {
  const { cx = 0, cy = 0, value = 0 } = props
  const isGood = value >= 20
  return <circle cx={cx} cy={cy} r={3.5} fill={isGood ? "#8b5cf6" : "#f59e0b"} stroke="white" strokeWidth={1.5} />
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: snapshots, isLoading, isError } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  const [selectedYear, setSelectedYear]         = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth]       = useState<number | null>(null)
  const [selectedBankKey, setSelectedBankKey]   = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  // "both" | "income" | "expenses"
  const [selectedMetric, setSelectedMetric]     = useState<"both" | "income" | "expenses">("both")

  // ── Años disponibles ──────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    if (!snapshots) return []
    const years = new Set<number>()
    snapshots.forEach(s => {
      const sy = getYear(s, "period_start"); if (sy) years.add(sy)
      const ey = getYear(s, "period_end");   if (ey) years.add(ey)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [snapshots])

  // ── Meses disponibles ─────────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    if (!snapshots || !selectedYear) return []
    const months = new Set<number>()
    snapshots.forEach(s => {
      const startD = parseDate(s.period_start)
      const endD   = parseDate(s.period_end) ?? startD
      if (!startD) return
      const cursor = new Date(startD.getFullYear(), startD.getMonth(), 1)
      const limit  = new Date((endD ?? startD).getFullYear(), (endD ?? startD).getMonth(), 1)
      while (cursor <= limit) {
        if (cursor.getFullYear() === selectedYear) months.add(cursor.getMonth() + 1)
        cursor.setMonth(cursor.getMonth() + 1)
      }
    })
    return Array.from(months).sort((a, b) => b - a)
  }, [snapshots, selectedYear])

  // ── Snapshots filtrados ───────────────────────────────────────────────────
  const filteredSnapshots = useMemo(() => {
    if (!snapshots?.length) return []
    if (!selectedYear) return snapshots
    return snapshots.filter(s => {
      const startYear = getYear(s, "period_start")
      const endYear   = getYear(s, "period_end") ?? startYear
      if (!startYear || !(startYear <= selectedYear && selectedYear <= (endYear ?? selectedYear))) return false
      if (!selectedMonth) return true
      const startD = parseDate(s.period_start)
      const endD   = parseDate(s.period_end) ?? startD
      if (!startD) return false
      const selStart = new Date(selectedYear, selectedMonth - 1, 1)
      const selEnd   = new Date(selectedYear, selectedMonth, 0)
      return startD <= selEnd && (endD ?? startD) >= selStart
    })
  }, [snapshots, selectedYear, selectedMonth])

  // ── Grupos por banco ──────────────────────────────────────────────────────
  const bankGroups = useMemo(() => {
    const map = new Map<string, { snapshots: AnalysisSnapshot[]; label: string }>()
    filteredSnapshots.forEach(s => {
      const key = s.bank_account?.account_id ?? "sin-banco"
      if (!map.has(key)) {
        const ba = s.bank_account
        map.set(key, { snapshots: [], label: ba
          ? `${ba.bank_name}${ba.account_last4 ? ` ••••${ba.account_last4}` : ""}`
          : "Sin banco" })
      }
      map.get(key)!.snapshots.push(s)
    })
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
  }, [filteredSnapshots])

  const bankAccountIdForQuery =
    selectedBankKey && selectedBankKey !== "sin-banco" ? selectedBankKey : undefined

  const filtersActive = !!(selectedYear || selectedBankKey)

  const { data: aggregated, isLoading: aggLoading } = useQuery({
    queryKey: ["analysis-aggregated", selectedYear, selectedMonth, bankAccountIdForQuery],
    queryFn: () => getAggregatedSummary({
      year:            selectedYear   ?? undefined,
      month:           selectedMonth  ?? undefined,
      bank_account_id: bankAccountIdForQuery,
    }),
    enabled: !!(snapshots?.length),
  })

  // Query separada para merchants de la categoría seleccionada
  // (el endpoint agrega solo merchants de esa categoría, sin límite de top-15 global)
  const { data: categoryMerchants } = useQuery({
    queryKey: ["analysis-merchants-by-cat", selectedYear, selectedMonth, bankAccountIdForQuery, selectedCategory],
    queryFn: () => getAggregatedSummary({
      year:            selectedYear   ?? undefined,
      month:           selectedMonth  ?? undefined,
      bank_account_id: bankAccountIdForQuery,
      budget_category: selectedCategory ?? undefined,
    }),
    enabled: !!(snapshots?.length && selectedCategory),
  })

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  // Gastos adicionales manuales del perfil → solo aplica cuando hay un mes específico seleccionado.
  // Son estimados recurrentes (no transacciones reales con fecha), así que:
  //   - mes específico → suma 1× el monthly_amount de cada estimado ✅
  //   - año sin mes    → suma 12× (un mes por cada mes del año) ✅
  //   - sin filtro     → no se suma (no tiene sentido añadir "1 mes" a un total de todos los tiempos) ✅
  const manualMonthlyBase = useMemo(() => {
    return (profile?.manual_expenses ?? []).reduce((sum, e) => sum + (e.monthly_amount ?? 0), 0)
  }, [profile])

  const manualMonthly = useMemo(() => {
    if (selectedMonth) return manualMonthlyBase          // mes específico → 1×
    if (selectedYear)  return manualMonthlyBase * 12     // año completo  → 12×
    return 0                                              // sin filtro    → no aplica
  }, [manualMonthlyBase, selectedMonth, selectedYear])

  const activeRecommendations = useMemo(() => {
    const src = selectedBankKey
      ? (bankGroups.find(g => g.key === selectedBankKey)?.snapshots ?? filteredSnapshots)
      : filteredSnapshots
    const seen = new Set<string>()
    return src.flatMap(s => s.recommendations).filter(r => {
      if (seen.has(r.code)) return false; seen.add(r.code); return true
    })
  }, [filteredSnapshots, selectedBankKey, bankGroups])

  const kpis = useMemo((): AggregatedSummary | null => {
    if (aggregated) return aggregated
    if (!filteredSnapshots.length) return null
    return snapshotAggregate(
      selectedBankKey
        ? (bankGroups.find(g => g.key === selectedBankKey)?.snapshots ?? filteredSnapshots)
        : filteredSnapshots
    ) as AggregatedSummary
  }, [aggregated, filteredSnapshots, selectedBankKey, bankGroups])

  // Saldo disponible: suma de available_balance de cuentas únicas con valor configurado
  const totalAvailableBalance = useMemo(() => {
    const src = selectedBankKey
      ? (bankGroups.find(g => g.key === selectedBankKey)?.snapshots ?? filteredSnapshots)
      : filteredSnapshots
    const seen = new Set<string>()
    let total: number | null = null
    src.forEach(s => {
      const ba = s.bank_account
      if (!ba || ba.bank_name === "Manual") return
      if (seen.has(ba.account_id)) return
      seen.add(ba.account_id)
      if (ba.available_balance != null) {
        total = (total ?? 0) + ba.available_balance
      }
    })
    return total   // null = ninguna cuenta tiene saldo configurado
  }, [filteredSnapshots, selectedBankKey, bankGroups])

  const loading = isLoading || aggLoading

  if (loading)  return <PageSpinner />
  if (isError)  return <ErrorMsg />
  if (!kpis)    return <EmptyState />

  const adjustedBalance = kpis.balance - manualMonthly  // manualMonthly ya es 0 cuando no hay filtro de período
  const savingsRate = kpis.total_income > 0
    ? ((adjustedBalance / kpis.total_income) * 100).toFixed(1) : "0.0"

  const normCat = (s: string) => s.toLowerCase().replace(/_/g, " ").trim()

  const categoryData = Object.entries(kpis.categories)
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([rawKey, value]) => ({ name: capitalize(rawKey), rawKey, value }))

  const allMerchantData = (kpis.top_merchants ?? [])
    .map(m => ({ name: m.name.length > 28 ? m.name.slice(0, 26) + "…" : m.name, value: m.amount, count: m.count, category: m.category }))

  // Cuando hay categoría seleccionada, usar la query específica que trae merchants de esa categoría
  const merchantData = selectedCategory
    ? (categoryMerchants?.top_merchants ?? [])
        .map(m => ({ name: m.name.length > 28 ? m.name.slice(0, 26) + "…" : m.name, value: m.amount, count: m.count, category: m.category }))
        .slice(0, 10)
    : allMerchantData.slice(0, 10)

  const etypeData = (kpis.by_economic_type ?? [])
    .filter(e => e.type !== "desconocido" || e.amount > 0)
    .map(e => ({ name: capitalize(e.type.replace(/_/g, " ")), value: e.amount, count: e.count, fill: ETYPE_COLORS[e.type] ?? "#94a3b8" }))

  const budgetRoleData = (kpis.by_budget_role ?? [])
    .filter(e => e.amount > 0)
    .map(e => ({ name: capitalize(e.type.replace(/_/g, " ")), value: e.amount, count: e.count, fill: BROLE_COLORS[e.type] ?? "#94a3b8" }))

  const trendData = (kpis.monthly_trend ?? [])

  // ── Datos derivados para gráficos adicionales ─────────────────────────────
  const balanceTrendData = trendData.map(d => ({
    label: d.label,
    balance: d.income - d.expenses,
  }))

  const savingsTrendData = trendData.map(d => ({
    label: d.label,
    rate: d.income > 0 ? Math.max(0, ((d.income - d.expenses) / d.income) * 100) : 0,
  }))

  // Gradiente dinámico del balance (verde arriba del 0, rojo abajo)
  const maxBal = Math.max(...balanceTrendData.map(d => d.balance), 0)
  const minBal = Math.min(...balanceTrendData.map(d => d.balance), 0)
  const totalRange = maxBal - minBal
  const zeroOffset = totalRange > 0 ? `${((maxBal / totalRange) * 100).toFixed(1)}%` : "0%"

  const highPriority = activeRecommendations.filter(r => r.type === "critical")

  const periodLabel = selectedMonth && selectedYear
    ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
    : selectedYear ? `${selectedYear}` : "Todos los períodos"

  const activeGroup = selectedBankKey ? bankGroups.find(g => g.key === selectedBankKey) : null
  const scopeLabel = activeGroup?.label
    ?? (bankGroups.length > 1 ? `${bankGroups.length} bancos consolidados` : bankGroups[0]?.label ?? "1 estado de cuenta")

  const singleSnapshotId = activeGroup?.snapshots.length === 1
    ? activeGroup.snapshots[0].snapshot_id
    : (!selectedBankKey && filteredSnapshots.length === 1)
      ? filteredSnapshots[0].snapshot_id : null

  const handleYearChange  = (y: number | null) => { setSelectedYear(y); setSelectedMonth(null); setSelectedBankKey(null) }
  const handleMonthChange = (m: number | null) => { setSelectedMonth(m); setSelectedBankKey(null) }

  /** Clic en un punto del gráfico de tendencia → activa filtro de mes */
  const handleChartMonthClick = (activeLabel?: string) => {
    if (!activeLabel) return
    const parsed = parseTrendLabel(activeLabel)
    if (!parsed) return
    // Toggle: si ya está seleccionado ese mes, limpia el filtro
    if (selectedYear === parsed.year && selectedMonth === parsed.month) {
      setSelectedYear(null)
      setSelectedMonth(null)
    } else {
      setSelectedYear(parsed.year)
      setSelectedMonth(parsed.month)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Resumen financiero</h1>
          <p className="page-subtitle">{periodLabel} · {scopeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {availableYears.length > 0 && (
            <select className="rounded-md border border-input bg-white px-3 py-1.5 text-sm shadow-sm"
              value={selectedYear ?? ""} onChange={e => handleYearChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos los años</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {selectedYear && availableMonths.length > 0 && (
            <select className="rounded-md border border-input bg-white px-3 py-1.5 text-sm shadow-sm"
              value={selectedMonth ?? ""} onChange={e => handleMonthChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos los meses</option>
              {availableMonths.map(m => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
            </select>
          )}
          <Button asChild size="sm"><Link to="/upload"><Upload className="h-4 w-4" />Subir estado</Link></Button>
        </div>
      </div>

      {/* ── Pills de banco ── */}
      {bankGroups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <PillButton active={!selectedBankKey} onClick={() => setSelectedBankKey(null)}
            icon={<Layers className="h-3.5 w-3.5" />} label={`Consolidado (${bankGroups.length})`} />
          {bankGroups.map(g => (
            <PillButton key={g.key} active={selectedBankKey === g.key} onClick={() => setSelectedBankKey(g.key)}
              icon={<Building2 className="h-3.5 w-3.5" />} label={g.label} />
          ))}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className={`grid gap-4 sm:grid-cols-2 ${totalAvailableBalance != null ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <KpiCard title="Ingresos" value={formatCurrency(kpis.total_income)}
          icon={<TrendingUp className="h-4 w-4" />} iconClass="kpi-icon-green" valueClass="text-green-600" />
        <KpiCard title="Gastos" value={formatCurrency(kpis.total_expenses + manualMonthly)}
          icon={<TrendingDown className="h-4 w-4" />} iconClass="kpi-icon-red" valueClass="text-red-500"
          sub={
            manualMonthlyBase > 0 && manualMonthly > 0
              ? selectedMonth
                ? `Incl. $${manualMonthlyBase.toFixed(0)}/mes adicionales`
                : `Incl. $${manualMonthlyBase.toFixed(0)}/mes × 12`
              : manualMonthlyBase > 0 && !selectedYear
                ? `Sin filtro — estimados mensuales no aplicados`
                : undefined
          } />
        <KpiCard title="Balance neto" value={formatCurrency(adjustedBalance)}
          icon={<Wallet className="h-4 w-4" />} iconClass="kpi-icon-blue"
          valueClass={adjustedBalance >= 0 ? "text-green-600" : "text-red-500"}
          sub={`Tasa de ahorro: ${savingsRate}%`} />
        {totalAvailableBalance != null && (
          <KpiCard title="Saldo disponible" value={formatCurrency(totalAvailableBalance)}
            icon={<DollarSign className="h-4 w-4" />} iconClass="kpi-icon-purple"
            valueClass={totalAvailableBalance >= 0 ? "text-green-600" : "text-red-500"}
            sub="Lo que realmente tienes en el banco" />
        )}
        <KpiCard title="Transacciones" value={`${kpis.total_transactions}`}
          icon={<BarChart2 className="h-4 w-4" />} iconClass="kpi-icon-orange"
          sub={filtersActive ? `${periodLabel} · filtradas` : scopeLabel} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TENDENCIA MENSUAL — interactiva
      ══════════════════════════════════════════════════════════════════════ */}
      {trendData.length > 1 && (
        <Card className="zoho-card border-0 overflow-hidden">
          {/* Header con leyenda interactiva */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/40">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tendencia mensual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedMonth
                  ? <>Filtrando <span className="font-medium text-primary">{periodLabel}</span> · haz clic en otro mes o en el mismo para quitar el filtro</>
                  : "Haz clic en un mes para filtrar toda la página"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <MetricPill
                active={selectedMetric === "both"}
                onClick={() => setSelectedMetric("both")}
                label="Ambos"
                color="#6366f1"
              />
              <MetricPill
                active={selectedMetric === "income"}
                onClick={() => setSelectedMetric(prev => prev === "income" ? "both" : "income")}
                label="Ingresos"
                color="#10b981"
                dot
              />
              <MetricPill
                active={selectedMetric === "expenses"}
                onClick={() => setSelectedMetric(prev => prev === "expenses" ? "both" : "expenses")}
                label="Gastos"
                color="#ef4444"
                line
              />
            </div>
          </div>

          <CardContent className="pt-5 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={trendData}
                margin={{ left: 8, right: 16, top: 16, bottom: 4 }}
                onClick={(data) => handleChartMonthClick(data?.activeLabel)}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => fmtK(v)}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<CurrencyTooltip />} />

                {/* Barras de ingresos */}
                {selectedMetric !== "expenses" && (
                  <Bar
                    dataKey="income"
                    name="Ingresos"
                    fill="url(#incomeBarGrad)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={42}
                  >
                    <LabelList
                      dataKey="income"
                      position="top"
                      formatter={(v: number) => fmtK(v)}
                      style={{ fontSize: 9, fill: "#059669", fontWeight: 600 }}
                    />
                    {trendData.map((entry, i) => {
                      const parsed = parseTrendLabel(entry.label)
                      const isSelected = !!(parsed && selectedYear === parsed.year && selectedMonth === parsed.month)
                      return (
                        <Cell
                          key={i}
                          fill={isSelected ? "#059669" : "url(#incomeBarGrad)"}
                          opacity={selectedMonth && !isSelected ? 0.45 : 1}
                          stroke={isSelected ? "#047857" : "none"}
                          strokeWidth={isSelected ? 1.5 : 0}
                        />
                      )
                    })}
                  </Bar>
                )}

                {/* Línea de gastos */}
                {selectedMetric !== "income" && (
                  <Line
                    dataKey="expenses"
                    name="Gastos"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    dot={(props: any) => (
                      <ExpenseDot
                        cx={props.cx}
                        cy={props.cy}
                        value={props.value}
                        showLabel={selectedMetric === "expenses"}
                      />
                    )}
                    activeDot={{ r: 7, fill: "#ef4444", stroke: "white", strokeWidth: 2 }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Leyenda visual fija en el fondo */}
            <div className="flex justify-center gap-6 mt-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 opacity-90" />
                Ingresos (barras)
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-6 border-t-2 border-red-400" style={{ marginBottom: 1 }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 -ml-1" />
                Gastos (línea)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EVOLUCIÓN DEL BALANCE — estilo TradingView
      ══════════════════════════════════════════════════════════════════════ */}
      {balanceTrendData.length > 1 && (
        <Card className="zoho-card border-0 overflow-hidden">
          {/* Header oscuro estilo TradingView */}
          <div
            className="flex items-center justify-between px-6 py-3.5"
            style={{ background: "linear-gradient(135deg, #1c2b4b 0%, #243356 100%)" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-white/10">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Evolución del balance</h2>
                <p className="text-xs text-white/50">Balance neto mensual (ingresos − gastos)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-white/70">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Positivo
              </span>
              <span className="flex items-center gap-1.5 text-white/70">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Negativo
              </span>
            </div>
          </div>

          <CardContent className="pt-4 pb-4 bg-[#fafbfc]">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart
                data={balanceTrendData}
                margin={{ left: 8, right: 16, top: 12, bottom: 4 }}
                onClick={(data) => handleChartMonthClick(data?.activeLabel)}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  <linearGradient id="balGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"        stopColor="#10b981" stopOpacity={0.45}/>
                    <stop offset={zeroOffset} stopColor="#10b981" stopOpacity={0.08}/>
                    <stop offset={zeroOffset} stopColor="#ef4444" stopOpacity={0.08}/>
                    <stop offset="100%"      stopColor="#ef4444" stopOpacity={0.30}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => fmtK(v)}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<BalanceTooltip />} />
                <ReferenceLine
                  y={0}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: "$0", position: "insideLeft", fontSize: 9, fill: "#94a3b8", dy: -6 }}
                />
                <Area
                  dataKey="balance"
                  name="Balance"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#balGradient)"
                  dot={(props: any) => {
                    const isPos = props.value >= 0
                    const parsed = parseTrendLabel(props.payload?.label ?? "")
                    const isSel = !!(parsed && selectedYear === parsed.year && selectedMonth === parsed.month)
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={isSel ? 6 : 4}
                        fill={isPos ? "#10b981" : "#ef4444"}
                        stroke="white"
                        strokeWidth={2}
                      />
                    )
                  }}
                  activeDot={{ r: 7, stroke: "white", strokeWidth: 2 }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TASA DE AHORRO — sparkline mensual
      ══════════════════════════════════════════════════════════════════════ */}
      {savingsTrendData.length > 1 && (
        <Card className="zoho-card border-0 overflow-hidden">
          <div
            className="flex items-center justify-between px-6 py-3.5"
            style={{ background: "linear-gradient(135deg, #4c1d95 0%, #5b21b6 100%)" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-white/10">
                <SavingsIcon className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Tasa de ahorro mensual</h2>
                <p className="text-xs text-white/50">% de ingresos que quedaron como ahorro cada mes</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/70">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                ≥ 20% — meta ideal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                &lt; 20% — por mejorar
              </span>
            </div>
          </div>

          <CardContent className="pt-4 pb-4 bg-[#fafbfc]">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={savingsTrendData}
                margin={{ left: 8, right: 16, top: 12, bottom: 4 }}
                onClick={(data) => handleChartMonthClick(data?.activeLabel)}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.03}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  domain={[0, "auto"]}
                />
                <Tooltip content={<SavingsTooltip />} />
                <ReferenceLine
                  y={20}
                  stroke="#8b5cf6"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{ value: "20% meta", position: "insideTopRight", fontSize: 9, fill: "#8b5cf6", dy: -4 }}
                />
                <Area
                  dataKey="rate"
                  name="Tasa de ahorro"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  fill="url(#savingsGradient)"
                  dot={<SavingsDot />}
                  activeDot={{ r: 7, fill: "#8b5cf6", stroke: "white", strokeWidth: 2 }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Fila: Categorías + Top Merchants ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>
              Top 8{filtersActive ? ` · ${periodLabel}` : ""}
              {selectedCategory && (
                <button onClick={() => setSelectedCategory(null)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20">
                  {capitalize(selectedCategory)} ✕
                </button>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0
              ? <p className="text-sm text-muted-foreground">Sin datos</p>
              : (
                <div className="space-y-2">
                  {categoryData.map((entry, i) => {
                    const color = CAT_COLORS[i % CAT_COLORS.length]
                    const emoji = CAT_EMOJI[entry.rawKey] ?? "📦"
                    const isUnknown = entry.rawKey === "otros" || entry.rawKey === "consumo_desconocido"
                    const isSelected = selectedCategory === entry.rawKey
                    const dimmed = !!selectedCategory && !isSelected
                    return (
                      <div
                        key={entry.rawKey}
                        onClick={() => setSelectedCategory(prev => prev === entry.rawKey ? null : entry.rawKey)}
                        className="flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-all hover:shadow-sm"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: color,
                          borderColor: isSelected ? color : undefined,
                          backgroundColor: isSelected ? `${color}18` : undefined,
                          opacity: dimmed ? 0.45 : 1,
                        }}
                      >
                        {/* Emoji icon */}
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                          style={{ backgroundColor: `${color}22` }}
                        >
                          {emoji}
                        </span>
                        {/* Nombre */}
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium leading-none">{entry.name}</span>
                          {isUnknown && (
                            <span className="block text-xs text-amber-600 mt-0.5">Sin categoría — afecta tu presupuesto</span>
                          )}
                        </span>
                        {/* Monto */}
                        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color }}>
                          {formatCurrency(entry.value)}
                        </span>
                        {/* Botón corregir para desconocidos */}
                        {isUnknown && (
                          <button
                            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-white transition-colors"
                            style={{ backgroundColor: "#d97706" }}
                            onClick={(e) => { e.stopPropagation(); navigate("/retrain") }}
                          >
                            Corregir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              Top comercios
              {selectedCategory && (
                <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {capitalize(selectedCategory)}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {selectedCategory
                ? `Top 10 en ${capitalize(selectedCategory)} · haz clic en la categoría para quitar el filtro`
                : "Los 10 donde más gastaste · haz clic en una categoría para filtrar"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {merchantData.length === 0
              ? <p className="text-sm text-muted-foreground">{selectedCategory ? `Sin comercios en "${capitalize(selectedCategory)}"` : filtersActive ? "Sin datos" : "Activa un filtro para ver el desglose"}</p>
              : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={merchantData} layout="vertical" margin={{ left: 4, right: 64 }}>
                    <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip formatter={(v: number, _, props) => [
                      `${formatCurrency(v)} · ${props.payload.count} transacciones`,
                      props.payload.category ? capitalize(props.payload.category) : "Comercio"
                    ]} />
                    <Bar dataKey="value" fill="#6366f1" radius={[0,4,4,0]}>
                      <LabelList dataKey="value" position="right"
                        formatter={(v: number) => `$${Math.round(v)}`}
                        style={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila: Rol en presupuesto + Por tipo económico ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rol en presupuesto</CardTitle>
            <CardDescription>Distribución de gastos por tipo de gasto</CardDescription>
          </CardHeader>
          <CardContent>
            {budgetRoleData.length === 0
              ? <p className="text-sm text-muted-foreground">Sin datos de gastos para el período</p>
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={budgetRoleData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      labelLine={false}
                      label={({ cx: lx, cy: ly, midAngle, innerRadius: ir, outerRadius: or, percent }) => {
                        if (percent < 0.07) return null
                        const r = ir + (or - ir) * 0.55
                        const x = lx + r * Math.cos(-midAngle * Math.PI / 180)
                        const y = ly + r * Math.sin(-midAngle * Math.PI / 180)
                        return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent * 100).toFixed(0)}%`}</text>
                      }}>
                      {budgetRoleData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _, props) => [
                      `${formatCurrency(v)} · ${props.payload.count} transacciones`, props.payload.name
                    ]} />
                    <Legend formatter={(value) => <span className="text-xs">{value}</span>} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por tipo económico</CardTitle>
            <CardDescription>Distribución del volumen total de transacciones</CardDescription>
          </CardHeader>
          <CardContent>
            {etypeData.length === 0
              ? <p className="text-sm text-muted-foreground">{filtersActive ? "Sin datos" : "Activa un filtro para ver el desglose"}</p>
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={etypeData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      labelLine={false}
                      label={({ cx: lx, cy: ly, midAngle, innerRadius: ir, outerRadius: or, percent }) => {
                        if (percent < 0.07) return null
                        const r = ir + (or - ir) * 0.55
                        const x = lx + r * Math.cos(-midAngle * Math.PI / 180)
                        const y = ly + r * Math.sin(-midAngle * Math.PI / 180)
                        return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent * 100).toFixed(0)}%`}</text>
                      }}>
                      {etypeData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _, props) => [
                      `${formatCurrency(v)} · ${props.payload.count} transacciones`, props.payload.name
                    ]} />
                    <Legend formatter={(value) => <span className="text-xs">{value}</span>} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recomendaciones ── */}
      <Card className="zoho-card border-0">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">💡 Recomendaciones financieras</CardTitle>
          </div>
          {highPriority.length > 0 && <Badge variant="destructive">{highPriority.length} urgentes</Badge>}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeRecommendations.length === 0
            ? <p className="text-sm text-muted-foreground col-span-3 py-4 text-center">¡Todo en orden! 🎉</p>
            : activeRecommendations.slice(0, 6).map((rec, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <div className={`mt-0.5 rounded-lg p-1.5 shrink-0 ${
                  rec.type === "critical" ? "bg-red-50 text-red-500" :
                  rec.type === "warning"  ? "bg-yellow-50 text-yellow-500" : "bg-blue-50 text-blue-500"
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm leading-snug">{rec.message}</p>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* ── Enlace ── */}
      <div className="flex justify-end">
        {singleSnapshotId
          ? <Button variant="outline" asChild><Link to={`/analysis/${singleSnapshotId}`}>Ver análisis completo <ArrowRight className="h-4 w-4" /></Link></Button>
          : <Button variant="outline" asChild><Link to="/analysis">Ver todos mis análisis <ArrowRight className="h-4 w-4" /></Link></Button>
        }
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function PillButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`filter-pill ${active ? "active" : ""}`}>
      {icon}{label}
    </button>
  )
}

function MetricPill({
  active, onClick, label, color, dot, line,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: string
  dot?: boolean
  line?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
      style={{
        background: active ? color + "18" : "transparent",
        color: active ? color : "#94a3b8",
        border: `1.5px solid ${active ? color + "60" : "#e2e8f0"}`,
      }}
    >
      {dot && <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />}
      {line && (
        <span className="flex items-center gap-0.5">
          <span className="w-3 border-t-2 inline-block" style={{ borderColor: color }} />
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
        </span>
      )}
      {!dot && !line && <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />}
      {label}
    </button>
  )
}

function KpiCard({ title, value, icon, iconClass, valueClass, sub }: {
  title: string; value: string; icon: ReactNode; iconClass?: string; valueClass?: string; sub?: string
}) {
  // Ajusta el tamaño de fuente según la longitud del valor para que siempre quepa completo
  const len = value.length
  const sizeClass = len <= 7 ? "text-2xl" : len <= 11 ? "text-xl" : "text-lg"

  return (
    <Card className="zoho-card border-0">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-tight">{title}</p>
          <div className={`shrink-0 ${iconClass ?? "kpi-icon-blue"}`}>{icon}</div>
        </div>
        <p className={`${sizeClass} font-bold leading-tight whitespace-nowrap ${valueClass ?? ""}`}>
          {value}
        </p>
        {sub && <p className="mt-1.5 text-xs text-muted-foreground" title={sub}>{sub}</p>}
      </CardContent>
    </Card>
  )
}

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function ErrorMsg() {
  return <div className="flex h-64 items-center justify-center text-muted-foreground">Error cargando datos.</div>
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-full bg-primary/10 p-6"><Upload className="h-10 w-10 text-primary" /></div>
      <div>
        <h2 className="text-xl font-semibold">Aún no hay análisis</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sube tu primer estado de cuenta para empezar</p>
      </div>
      <Button asChild><Link to="/upload"><Upload className="h-4 w-4" />Subir estado de cuenta</Link></Button>
    </div>
  )
}
