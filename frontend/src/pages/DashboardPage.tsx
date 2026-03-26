import { type ReactNode, useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Upload, ArrowRight, BarChart2, Building2, Layers, ShoppingBag
} from "lucide-react"
import { listAnalysis, getAggregatedSummary } from "@/api/analysis"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, capitalize } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ComposedChart, CartesianGrid,
} from "recharts"
import type { AnalysisSnapshot, AggregatedSummary } from "@/types"

// ─── Paleta ──────────────────────────────────────────────────────────────────
const CAT_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"]

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

// ─── Snapshot-level aggregate (cuando no hay filtros activos) ─────────────────
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

// ─── Componentes de tooltip custom ───────────────────────────────────────────
function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-xs">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { data: snapshots, isLoading, isError } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  const [selectedYear, setSelectedYear]       = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth]     = useState<number | null>(null)
  const [selectedBankKey, setSelectedBankKey] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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

  // ── Snapshots del período (para pills y recomendaciones) ──────────────────
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

  // Siempre llamamos al endpoint — sin filtros devuelve el consolidado completo
  const { data: aggregated, isLoading: aggLoading } = useQuery({
    queryKey: ["analysis-aggregated", selectedYear, selectedMonth, bankAccountIdForQuery],
    queryFn: () => getAggregatedSummary({
      year:            selectedYear   ?? undefined,
      month:           selectedMonth  ?? undefined,
      bank_account_id: bankAccountIdForQuery,
    }),
    enabled: !!(snapshots?.length),  // esperar a que haya snapshots cargados
  })

  // ── Recomendaciones desde snapshots ──────────────────────────────────────
  const activeRecommendations = useMemo(() => {
    const src = selectedBankKey
      ? (bankGroups.find(g => g.key === selectedBankKey)?.snapshots ?? filteredSnapshots)
      : filteredSnapshots
    const seen = new Set<string>()
    return src.flatMap(s => s.recommendations).filter(r => {
      if (seen.has(r.code)) return false; seen.add(r.code); return true
    })
  }, [filteredSnapshots, selectedBankKey, bankGroups])

  // ── KPIs: siempre del servidor cuando disponible, snapshot-level mientras carga ──
  const kpis = useMemo((): AggregatedSummary | null => {
    if (aggregated) return aggregated
    if (!filteredSnapshots.length) return null
    // Fallback inmediato mientras carga el endpoint
    return snapshotAggregate(
      selectedBankKey
        ? (bankGroups.find(g => g.key === selectedBankKey)?.snapshots ?? filteredSnapshots)
        : filteredSnapshots
    ) as AggregatedSummary
  }, [aggregated, filteredSnapshots, selectedBankKey, bankGroups])

  const loading = isLoading || aggLoading

  if (loading)  return <PageSpinner />
  if (isError)  return <ErrorMsg />
  if (!kpis)    return <EmptyState />

  const savingsRate = kpis.total_income > 0
    ? ((kpis.balance / kpis.total_income) * 100).toFixed(1) : "0.0"

  // normaliza una categoría para comparación: lowercase + underscores→spaces
  const normCat = (s: string) => s.toLowerCase().replace(/_/g, " ").trim()

  const categoryData = Object.entries(kpis.categories)
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([rawKey, value]) => ({ name: capitalize(rawKey), rawKey, value }))

  const allMerchantData = (kpis.top_merchants ?? [])
    .map(m => ({ name: m.name.length > 28 ? m.name.slice(0, 26) + "…" : m.name, value: m.amount, count: m.count, category: m.category }))

  const merchantData = selectedCategory
    ? allMerchantData
        .filter(m => normCat(m.category ?? "") === normCat(selectedCategory))
        .slice(0, 10)
    : allMerchantData.slice(0, 10)

  const etypeData = (kpis.by_economic_type ?? [])
    .filter(e => e.type !== "desconocido" || e.amount > 0)
    .map(e => ({ name: capitalize(e.type.replace(/_/g, " ")), value: e.amount, count: e.count, fill: ETYPE_COLORS[e.type] ?? "#94a3b8" }))

  const budgetRoleData = (kpis.by_budget_role ?? [])
    .filter(e => e.amount > 0)
    .map(e => ({ name: capitalize(e.type.replace(/_/g, " ")), value: e.amount, count: e.count, fill: BROLE_COLORS[e.type] ?? "#94a3b8" }))

  const trendData = (kpis.monthly_trend ?? [])

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

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{periodLabel} · {scopeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {availableYears.length > 0 && (
            <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              value={selectedYear ?? ""} onChange={e => handleYearChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos los años</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {selectedYear && availableMonths.length > 0 && (
            <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Ingresos"     value={formatCurrency(kpis.total_income)}
          icon={<TrendingUp className="h-4 w-4 text-green-600" />}  valueClass="text-green-600" />
        <KpiCard title="Gastos"       value={formatCurrency(kpis.total_expenses)}
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}  valueClass="text-red-500" />
        <KpiCard title="Balance"      value={formatCurrency(kpis.balance)}
          icon={<Wallet className="h-4 w-4 text-primary" />}
          valueClass={kpis.balance >= 0 ? "text-green-600" : "text-red-500"} />
        <KpiCard title="Tasa de ahorro" value={`${savingsRate}%`}
          icon={<BarChart2 className="h-4 w-4 text-purple-600" />}  valueClass="text-purple-600"
          sub={`${kpis.total_transactions} transacciones${filtersActive ? " · filtradas" : ""}`} />
      </div>

      {/* ── Tendencia mensual (solo si hay >1 mes de datos) ── */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendencia mensual</CardTitle>
            <CardDescription>Ingresos vs. gastos por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip content={<CurrencyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income"   name="Ingresos" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="expenses" name="Gastos"   fill="#ef4444" radius={[3,3,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Fila: Categorías + Top Merchants ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Categorías */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>
              Top 8{filtersActive ? ` · ${periodLabel}` : ""}
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {capitalize(selectedCategory)} ✕
                </button>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0
              ? <p className="text-sm text-muted-foreground">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={categoryData}
                    layout="vertical"
                    margin={{ left: 8 }}
                    onClick={(data) => {
                      if (!data?.activePayload?.[0]) return
                      const rawKey = data.activePayload[0].payload.rawKey
                      setSelectedCategory(prev => prev === rawKey ? null : rawKey)
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={105} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="value" radius={[0,4,4,0]}>
                      {categoryData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={CAT_COLORS[i % CAT_COLORS.length]}
                          opacity={!selectedCategory || selectedCategory === entry.rawKey ? 1 : 0.3}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* Top Merchants */}
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
              ? <p className="text-sm text-muted-foreground">{selectedCategory ? `Sin comercios categorizados como "${capitalize(selectedCategory)}"` : filtersActive ? "Sin datos para el filtro seleccionado" : "Activa un filtro para ver el desglose por comercio"}</p>
              : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={merchantData} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip
                      formatter={(v: number, _, props) => [
                        `${formatCurrency(v)} · ${props.payload.count} transacciones`,
                        props.payload.category ? capitalize(props.payload.category) : "Comercio"
                      ]}
                    />
                    <Bar dataKey="value" fill="#6366f1" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila: Rol en presupuesto + Por tipo económico ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rol en presupuesto — donut */}
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
                    <Pie
                      data={budgetRoleData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                    >
                      {budgetRoleData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _, props) => [
                      `${formatCurrency(v)} · ${props.payload.count} transacciones`,
                      props.payload.name
                    ]} />
                    <Legend
                      formatter={(value) => <span className="text-xs">{value}</span>}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* Por tipo económico — pie chart */}
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
                    <Pie
                      data={etypeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                    >
                      {etypeData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _, props) => [
                      `${formatCurrency(v)} · ${props.payload.count} transacciones`,
                      props.payload.name
                    ]} />
                    <Legend
                      formatter={(value) => <span className="text-xs">{value}</span>}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recomendaciones ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Recomendaciones</CardTitle>
          {highPriority.length > 0 && <Badge variant="destructive">{highPriority.length} urgentes</Badge>}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeRecommendations.length === 0
            ? <p className="text-sm text-muted-foreground">Todo en orden 🎉</p>
            : activeRecommendations.slice(0, 6).map((rec, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${
                  rec.type === "critical" ? "text-red-500" :
                  rec.type === "warning"  ? "text-yellow-500" : "text-blue-500"
                }`} />
                <p className="text-sm">{rec.message}</p>
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

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function PillButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
      }`}
    >
      {icon}{label}
    </button>
  )
}

function KpiCard({ title, value, icon, valueClass, sub }: { title: string; value: string; icon: ReactNode; valueClass?: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
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
      <div className="rounded-full bg-muted p-6"><Upload className="h-10 w-10 text-muted-foreground" /></div>
      <div>
        <h2 className="text-xl font-semibold">Aún no hay análisis</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sube tu primer estado de cuenta para empezar</p>
      </div>
      <Button asChild><Link to="/upload"><Upload className="h-4 w-4" />Subir estado de cuenta</Link></Button>
    </div>
  )
}
