import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import {
  ArrowLeft, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  List, Building2, Percent, CheckCircle2, Info,
} from "lucide-react"
import { getAnalysis, getConfidenceStats } from "@/api/analysis"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatPeriod, capitalize } from "@/lib/utils"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

// ─── Paleta de colores ────────────────────────────────────────────────────────
const COLORS = [
  "#e05c19", "#3b82f6", "#10b981", "#8b5cf6",
  "#f59e0b", "#06b6d4", "#ef4444", "#84cc16",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1",
]

const BANK_COLORS: Record<string, string> = {
  "Banco General":  "#1a3a8f",
  "BAC Credomatic": "#e31837",
  "Banistmo":       "#00843d",
}

// ─── Tooltip custom ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: number } }[] }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-0.5">{name}</p>
      <p className="text-muted-foreground">{formatCurrency(value)}</p>
      <p className="text-muted-foreground">{(p.percent * 100).toFixed(1)}% del total</p>
    </div>
  )
}

// ─── Ícono de recomendación según tipo ────────────────────────────────────────
function RecIcon({ type }: { type: string }) {
  if (type === "critical")
    return (
      <div className="kpi-icon-red shrink-0">
        <AlertTriangle className="h-4 w-4" />
      </div>
    )
  if (type === "warning")
    return (
      <div className="kpi-icon-orange shrink-0">
        <AlertTriangle className="h-4 w-4" />
      </div>
    )
  return (
    <div className="kpi-icon-blue shrink-0">
      <Info className="h-4 w-4" />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getAnalysis(id!),
    enabled: !!id,
  })

  const { data: stats } = useQuery({
    queryKey: ["confidence-stats", id],
    queryFn: () => getConfidenceStats(id!),
    enabled: !!id,
  })

  if (isLoading || !snapshot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // Datos del gráfico — ordenados de mayor a menor, top 10 + "Otros"
  const sorted = Object.entries(snapshot.categories).sort(([, a], [, b]) => b - a)
  const top    = sorted.slice(0, 10)
  const rest   = sorted.slice(10)
  const othersVal = rest.reduce((s, [, v]) => s + v, 0)
  const chartData = [
    ...top.map(([name, value]) => ({ name: capitalize(name), value })),
    ...(othersVal > 0 ? [{ name: "Otros", value: othersVal }] : []),
  ]
  const total = chartData.reduce((s, d) => s + d.value, 0)

  const savingsRate = snapshot.total_income > 0
    ? ((snapshot.balance / snapshot.total_income) * 100).toFixed(1)
    : "0.0"

  const highPriority  = snapshot.recommendations.filter((r) => r.type === "critical")
  const requiresReview = stats?.requires_review ?? 0
  const bankColor = snapshot.bank_account
    ? (BANK_COLORS[snapshot.bank_account.bank_name] ?? "#6b7280")
    : "#6b7280"

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="animate-fade-up anim-d0 page-header">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
            <Link to="/analysis"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="page-title">
              {formatPeriod(snapshot.period_start, snapshot.period_end)}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 mt-1">
              <span className="text-xs text-muted-foreground">
                {snapshot.total_transactions} transacciones
              </span>
              {snapshot.bank_account && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  <span style={{ background: bankColor, width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  {snapshot.bank_account.bank_name}
                  {snapshot.bank_account.account_last4 && ` ····${snapshot.bank_account.account_last4}`}
                  {snapshot.bank_account.nickname && ` · ${snapshot.bank_account.nickname}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Alertas ── */}
      {(requiresReview > 0 || highPriority.length > 0) && (
        <div className="animate-fade-up anim-d1 flex flex-wrap gap-2">
          {requiresReview > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{requiresReview} transacciones requieren revisión</span>
              <Link
                to={`/analysis/${id}/transactions?requires_review=true`}
                className="font-semibold underline underline-offset-2 hover:text-yellow-900 ml-1"
              >
                Revisar →
              </Link>
            </div>
          )}
          {highPriority.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {highPriority.length} recomendación{highPriority.length > 1 ? "es" : ""} crítica{highPriority.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Ingresos", value: formatCurrency(snapshot.total_income),
            icon: <TrendingUp className="h-4 w-4" />, iconClass: "kpi-icon-green",
            valueClass: "text-green-600", delay: "anim-d1",
          },
          {
            label: "Gastos", value: formatCurrency(snapshot.total_expenses),
            icon: <TrendingDown className="h-4 w-4" />, iconClass: "kpi-icon-red",
            valueClass: "text-red-500", delay: "anim-d2",
          },
          {
            label: "Balance neto", value: formatCurrency(snapshot.balance),
            icon: <Wallet className="h-4 w-4" />, iconClass: "kpi-icon-blue",
            valueClass: snapshot.balance >= 0 ? "text-green-600" : "text-red-500",
            delay: "anim-d3",
          },
          {
            label: "Tasa de ahorro", value: `${savingsRate}%`,
            icon: <Percent className="h-4 w-4" />, iconClass: "kpi-icon-purple",
            valueClass: Number(savingsRate) >= 20 ? "text-purple-600" : "text-yellow-600",
            delay: "anim-d4",
          },
        ].map(({ label, value, icon, iconClass, valueClass, delay }) => (
          <Card key={label} className={`zoho-card border-0 animate-fade-up ${delay}`}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                <div className={iconClass}>{icon}</div>
              </div>
              <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Gráfico + Recomendaciones ── */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">

        {/* Donut chart + leyenda lateral como lista */}
        <Card className="zoho-card border-0 animate-fade-up anim-d4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribución de gastos</CardTitle>
            <p className="text-xs text-muted-foreground">Por categoría · Top {Math.min(chartData.length, 10)}{othersVal > 0 ? " + Otros" : ""}</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">

              {/* Donut — sin labels en los slices */}
              <div className="shrink-0 mx-auto sm:mx-0" style={{ width: 200, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda como lista con barra de progreso */}
              <div className="flex-1 min-w-0 space-y-2 max-h-52 overflow-y-auto pr-1">
                {chartData.map((d, i) => {
                  const pct = total > 0 ? (d.value / total) * 100 : 0
                  return (
                    <div key={d.name} className="flex items-center gap-2 group">
                      {/* Dot */}
                      <span
                        className="shrink-0 rounded-full"
                        style={{ background: COLORS[i % COLORS.length], width: 8, height: 8 }}
                      />
                      {/* Nombre */}
                      <span className="text-xs text-foreground font-medium truncate flex-1 min-w-0" title={d.name}>
                        {d.name}
                      </span>
                      {/* Barra de progreso */}
                      <div className="shrink-0 w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                      {/* Porcentaje */}
                      <span className="shrink-0 text-xs text-muted-foreground w-8 text-right tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Recomendaciones */}
        <Card className="zoho-card border-0 animate-fade-up anim-d5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              💡 Recomendaciones
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {snapshot.recommendations.length === 0
                ? "Sin alertas activas"
                : `${snapshot.recommendations.length} observaciones`}
            </p>
          </CardHeader>
          <CardContent>
            {snapshot.recommendations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="kpi-icon-green"><CheckCircle2 className="h-5 w-5" /></div>
                <p className="text-sm font-medium text-foreground">¡Todo en orden!</p>
                <p className="text-xs text-muted-foreground">No hay recomendaciones para este período.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {snapshot.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className={`animate-fade-up flex items-start gap-3 rounded-lg border border-border p-3 anim-d${Math.min(i + 1, 6)}`}
                  >
                    <RecIcon type={rec.type} />
                    <p className="text-sm leading-relaxed text-foreground">{rec.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Botón transacciones ── */}
      <div className="animate-fade-up anim-d6 flex justify-end">
        <Button asChild size="default" className="gap-2 shadow-sm">
          <Link to={`/analysis/${id}/transactions`}>
            <List className="h-4 w-4" />
            Ver todas las transacciones
          </Link>
        </Button>
      </div>
    </div>
  )
}
