import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import {
  FlaskConical, Info, TrendingDown, Sliders, CalendarDays,
  AlertTriangle, DollarSign, Clock, Target, ChevronDown, ChevronUp,
  Plus, Trash2, Banknote, ArrowUpCircle, ArrowDownCircle, CreditCard,
} from "lucide-react"
import { getAggregatedSummary } from "@/api/analysis"
import ProGate from "@/components/ProGate"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function monthsUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  return Math.max(diff, 1)
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
}

function shortLabel(month: string): string {
  const [y, m] = month.split("-")
  return `${MONTH_LABELS[m] ?? m} ${y?.slice(2)}`
}

// ─── Disclaimer ──────────────────────────────────────────────────────────────

function Disclaimer() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
      <FlaskConical className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Solo educativo y referencial</p>
        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
          Las simulaciones aquí presentadas se basan en tus datos históricos y aplican
          aritmética simple. <strong>No son predicciones del futuro ni asesoría financiera.</strong>{" "}
          Los resultados sirven para reflexionar y explorar escenarios — no para tomar decisiones
          financieras importantes sin consultar a un profesional.
        </p>
      </div>
    </div>
  )
}

// ─── Tab 1: Runway ────────────────────────────────────────────────────────────

function RunwayTab({ trend, totalExpenses, totalMonths }: {
  trend: { month: string; expenses: number }[]
  totalExpenses: number
  totalMonths: number
}) {
  const [saldo, setSaldo] = useState("")
  const [mesesBase, setMesesBase] = useState<3 | 6 | 12>(3)

  const avgMonthly = useMemo(() => {
    const slice = trend.slice(-mesesBase)
    if (!slice.length) return totalExpenses / Math.max(totalMonths, 1)
    return avg(slice.map(m => m.expenses))
  }, [trend, mesesBase, totalExpenses, totalMonths])

  const dailyAvg = avgMonthly / 30
  const saldoNum = parseFloat(saldo.replace(",", ".")) || 0
  const dias = saldoNum > 0 && dailyAvg > 0 ? Math.floor(saldoNum / dailyAvg) : null

  const color = dias == null ? "gray"
    : dias < 15 ? "red"
    : dias < 30 ? "amber"
    : "green"

  const colorClasses = {
    gray: { bg: "bg-gray-100", text: "text-gray-500", bar: "#9ca3af" },
    red: { bg: "bg-red-50", text: "text-red-600", bar: "#ef4444" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", bar: "#f59e0b" },
    green: { bg: "bg-green-50", text: "text-green-600", bar: "#22c55e" },
  }[color]

  const pct = dias != null ? Math.min((dias / 60) * 100, 100) : 0

  return (
    <div className="space-y-6">
      <div className="zoho-card rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="kpi-icon-blue"><Clock className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold text-sm">¿Cuánto te dura el dinero?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Basado en tu gasto promedio, ¿cuántos días te alcanza tu saldo actual?
            </p>
          </div>
        </div>

        {/* Config */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Tu saldo actual ($)
            </label>
            <input
              type="number"
              min={0}
              placeholder="ej: 800"
              value={saldo}
              onChange={e => setSaldo(e.target.value)}
              style={{ color: "#111827", background: "#ffffff" }}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Promedio basado en
            </label>
            <select
              value={mesesBase}
              onChange={e => setMesesBase(Number(e.target.value) as 3 | 6 | 12)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value={3}>Últimos 3 meses</option>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
            </select>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Gasto promedio mensual</p>
            <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(avgMonthly)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Gasto promedio diario</p>
            <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(dailyAvg)}</p>
          </div>
        </div>

        {/* Result */}
        {saldoNum > 0 && dias !== null ? (
          <div className={cn("rounded-xl p-5 text-center space-y-3", colorClasses.bg)}>
            <p className={cn("text-4xl font-extrabold", colorClasses.text)}>{dias} días</p>
            <p className="text-sm text-muted-foreground">
              Con {formatCurrency(saldoNum)} y un gasto diario de {formatCurrency(dailyAvg)},
              tu dinero alcanza hasta el{" "}
              <strong>
                {new Date(Date.now() + dias * 86400000).toLocaleDateString("es-PA", {
                  day: "numeric", month: "long",
                })}
              </strong>.
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: colorClasses.bar }}
              />
            </div>
            {color === "red" && (
              <p className="text-xs text-red-600 font-medium flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Menos de 15 días — considera reducir gastos esta semana
              </p>
            )}
            {color === "amber" && (
              <p className="text-xs text-amber-600 font-medium">
                Entre 15 y 30 días — revisa tus gastos antes de tu próxima fecha de cobro
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-muted/30 p-5 text-center text-sm text-muted-foreground">
            Ingresa tu saldo actual para ver cuántos días te dura
          </div>
        )}
      </div>

      {/* Mini trend chart */}
      {trend.length > 1 && (
        <div className="zoho-card rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">Gastos mensuales históricos</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={trend} barSize={20} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="month" tickFormatter={shortLabel} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={shortLabel} />
              <ReferenceLine y={avgMonthly} stroke="#e05c19" strokeDasharray="4 4"
                label={{ value: "Prom", position: "right", fontSize: 10, fill: "#e05c19" }} />
              <Bar dataKey="expenses" name="Gastos" fill="#1c2b4b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            La línea naranja es tu promedio de los últimos {mesesBase} meses
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Escenarios hipotéticos ───────────────────────────────────────────

function EscenariosTab({ categories, merchants, totalMonths }: {
  categories: Record<string, number>
  merchants: { name: string; amount: number; count: number }[]
  totalMonths: number
}) {
  const [reductions, setReductions] = useState<Record<string, number>>({})
  const [goalName, setGoalName] = useState("")
  const [goalAmount, setGoalAmount] = useState("")
  const [goalDate, setGoalDate] = useState("")
  const [showSubs, setShowSubs] = useState(true)

  const months = Math.max(totalMonths, 1)

  // Avg monthly per category
  const avgCategories = useMemo(() =>
    Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, v / months])
    ), [categories, months])

  const sortedCats = useMemo(() =>
    Object.entries(avgCategories)
      .filter(([, v]) => v > 5)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
    , [avgCategories])

  const totalMonthlySavings = sortedCats.reduce((sum, [cat]) => {
    const reduction = reductions[cat] ?? 0
    return sum + avgCategories[cat] * (reduction / 100)
  }, 0)
  const annualSavings = totalMonthlySavings * 12

  // Subscriptions: merchants with count >= 3 (recurring)
  const possibleSubs = useMemo(() =>
    merchants.filter(m => m.count >= 3).slice(0, 10)
    , [merchants])

  // Goal inverse
  const goalAmountNum = parseFloat(goalAmount.replace(",", ".")) || 0
  const goalMonths = goalDate ? monthsUntil(goalDate) : 0
  const monthlyForGoal = goalMonths > 0 ? goalAmountNum / goalMonths : 0
  const weeklyForGoal = monthlyForGoal / 4.33

  return (
    <div className="space-y-6">
      {/* Category sliders */}
      <div className="zoho-card rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="kpi-icon-orange"><Sliders className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold text-sm">¿Qué pasa si reduzco mis gastos?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mueve los sliders para ver cuánto ahorrarías al reducir cada categoría
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {sortedCats.map(([cat, monthly]) => {
            const pct = reductions[cat] ?? 0
            const saving = monthly * (pct / 100)
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium capitalize">{cat}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(monthly)}/mes
                    {saving > 0 && (
                      <span className="text-green-600 ml-1.5 font-semibold">
                        −{formatCurrency(saving)}
                      </span>
                    )}
                  </span>
                </div>
                <input
                  type="range" min={0} max={50} step={5} value={pct}
                  onChange={e => setReductions(r => ({ ...r, [cat]: Number(e.target.value) }))}
                  className="w-full accent-primary h-1.5"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>0%</span>
                  <span className="font-medium text-primary">{pct}% menos</span>
                  <span>50%</span>
                </div>
              </div>
            )
          })}
        </div>

        {totalMonthlySavings > 0 && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs text-green-700">Ahorro mensual</p>
              <p className="text-xl font-bold text-green-700">{formatCurrency(totalMonthlySavings)}</p>
            </div>
            <div>
              <p className="text-xs text-green-700">Ahorro anual</p>
              <p className="text-xl font-bold text-green-700">{formatCurrency(annualSavings)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Subscriptions */}
      {possibleSubs.length > 0 && (
        <div className="zoho-card rounded-xl p-5 space-y-3">
          <button
            onClick={() => setShowSubs(v => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-start gap-3">
              <div className="kpi-icon-purple">
                <TrendingDown className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm">Gastos recurrentes detectados</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Merchants que aparecen 3+ veces en tu historial
                </p>
              </div>
            </div>
            {showSubs
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>

          {showSubs && (
            <div className="space-y-2 mt-1">
              {possibleSubs.map(m => {
                const monthly = m.amount / months
                const annual = monthly * 12
                return (
                  <div key={m.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium capitalize">{m.name.toLowerCase()}</p>
                      <p className="text-xs text-muted-foreground">{m.count} veces · {formatCurrency(monthly)}/mes estimado</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(annual)}</p>
                      <p className="text-xs text-muted-foreground">al año</p>
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground text-center pt-1">
                Total anual estimado en recurrentes:{" "}
                <strong>{formatCurrency(possibleSubs.reduce((s, m) => s + (m.amount / months) * 12, 0))}</strong>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Meta inversa */}
      <div className="zoho-card rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="kpi-icon-green"><Target className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold text-sm">Meta de ahorro inversa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              ¿Quieres comprar algo o ahorrar para una fecha? Calcula cuánto necesitas separar cada semana
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="¿Para qué? (ej: vacaciones)"
            value={goalName}
            onChange={e => setGoalName(e.target.value)}
            style={{ color: "#111827", background: "#ffffff" }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="number"
            min={0}
            placeholder="Monto ($)"
            value={goalAmount}
            onChange={e => setGoalAmount(e.target.value)}
            style={{ color: "#111827", background: "#ffffff" }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-col gap-1">
            <input
              type="date"
              value={goalDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={e => setGoalDate(e.target.value)}
              style={{ color: "#111827", background: "#ffffff" }}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-[10px] text-muted-foreground pl-1">Formato: mes/día/año</span>
          </div>
        </div>

        {goalAmountNum > 0 && goalMonths > 0 && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-800 text-center">
              {goalName ? `Para "${goalName}"` : "Para tu meta"} en {goalMonths} {goalMonths === 1 ? "mes" : "meses"}:
            </p>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-blue-600">Por semana</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency(weeklyForGoal)}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Por mes</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency(monthlyForGoal)}</p>
              </div>
            </div>
            <p className="text-xs text-blue-600 text-center">
              Total a ahorrar: <strong>{formatCurrency(goalAmountNum)}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 3: Estacionalidad ────────────────────────────────────────────────────

function EstacionalidadTab({ trend }: {
  trend: { month: string; income: number; expenses: number }[]
}) {
  const [mesesProyectar, setMesesProyectar] = useState(3)

  const avgExpenses = useMemo(() => avg(trend.map(t => t.expenses)), [trend])
  const avgIncome = useMemo(() => avg(trend.map(t => t.income)), [trend])

  // Generate projected months
  const projected = useMemo(() => {
    if (!trend.length) return []
    const last = trend[trend.length - 1].month
    const [y, m] = last.split("-").map(Number)
    return Array.from({ length: mesesProyectar }, (_, i) => {
      const d = new Date(y, m + i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      return {
        month: key,
        expenses: avgExpenses,
        income: avgIncome,
        projected: true,
      }
    })
  }, [trend, mesesProyectar, avgExpenses, avgIncome])

  // Merge historical + projected into one dataset for the chart
  // Projected months get null for historical fields and their own value for projected fields
  const lastHistorical = trend.length > 0 ? trend[trend.length - 1] : null

  const fullData = [
    ...trend.map(t => ({
      month: t.month,
      expenses_real: t.expenses,
      expenses_proj: null as number | null,
      income_real: t.income,
    })),
    // Repeat last historical point as first projected point so the lines connect
    ...(lastHistorical ? [{
      month: lastHistorical.month,
      expenses_real: null as number | null,
      expenses_proj: avgExpenses,
      income_real: null as number | null,
    }] : []),
    ...projected.map(p => ({
      month: p.month,
      expenses_real: null as number | null,
      expenses_proj: avgExpenses,
      income_real: null as number | null,
    })),
  ]

  // Detect peak months (> 1.2x average)
  const peaks = trend.filter(t => t.expenses > avgExpenses * 1.2)

  return (
    <div className="space-y-6">
      {trend.length < 2 ? (
        <div className="zoho-card rounded-xl p-8 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Necesitas al menos 2 meses de datos</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sube más estados de cuenta para ver patrones de estacionalidad
          </p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="zoho-card rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="kpi-icon-blue"><CalendarDays className="h-4 w-4" /></div>
                <div>
                  <h3 className="font-semibold text-sm">Tendencia + proyección</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Histórico real + estimado basado en tu promedio
                  </p>
                </div>
              </div>
              <select
                value={mesesProyectar}
                onChange={e => setMesesProyectar(Number(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
              >
                <option value={1}>+1 mes</option>
                <option value={3}>+3 meses</option>
                <option value={6}>+6 meses</option>
              </select>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={fullData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="month" tickFormatter={shortLabel} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={36} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={shortLabel} />
                <ReferenceLine y={avgExpenses} stroke="#e05c19" strokeDasharray="4 4"
                  label={{ value: "Prom", position: "insideTopRight", fontSize: 10, fill: "#e05c19" }} />
                <Line
                  dataKey="expenses_real"
                  name="Gastos reales"
                  stroke="#1c2b4b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="expenses_proj"
                  name="Proyección"
                  stroke="#e05c19"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="income_real"
                  name="Ingresos"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 3"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-[#1c2b4b]" /> Gastos reales
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-[1px] border-t-2 border-dashed border-[#e05c19]" />
                <span className="w-2 h-2 rounded-full bg-[#e05c19] inline-block" /> Proyección
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-green-500 opacity-60" /> Ingresos
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="zoho-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground">Gasto promedio/mes</p>
              <p className="text-lg font-bold">{formatCurrency(avgExpenses)}</p>
            </div>
            <div className="zoho-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground">Ingreso promedio/mes</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(avgIncome)}</p>
            </div>
            <div className="zoho-card rounded-xl p-4 text-center col-span-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Ahorro promedio/mes</p>
              <p className={cn("text-lg font-bold", avgIncome - avgExpenses >= 0 ? "text-green-600" : "text-red-500")}>
                {formatCurrency(avgIncome - avgExpenses)}
              </p>
            </div>
          </div>

          {/* Peaks alert */}
          {peaks.length > 0 && (
            <div className="zoho-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Meses con gastos inusualmente altos</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Estos meses tuviste gastos más de un 20% por encima de tu promedio. Si son recurrentes
                (seguros anuales, temporadas, etc.), considera reservar dinero con anticipación.
              </p>
              <div className="space-y-2">
                {peaks.map(p => (
                  <div key={p.month} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{shortLabel(p.month)}</p>
                      <p className="text-xs text-muted-foreground">
                        {((p.expenses / avgExpenses - 1) * 100).toFixed(0)}% sobre el promedio
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-600">{formatCurrency(p.expenses)}</p>
                      <p className="text-xs text-muted-foreground">vs {formatCurrency(avgExpenses)} prom.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly bars for context */}
          <div className="zoho-card rounded-xl p-5">
            <p className="text-sm font-semibold mb-3">Gastos por mes</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={trend} barSize={20} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="month" tickFormatter={shortLabel} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={36} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={shortLabel} />
                <ReferenceLine y={avgExpenses} stroke="#e05c19" strokeDasharray="4 4" />
                <Bar dataKey="expenses" name="Gastos" radius={[3, 3, 0, 0]}>
                  {trend.map(entry => (
                    <Cell
                      key={entry.month}
                      fill={entry.expenses > avgExpenses * 1.2 ? "#f59e0b" : "#1c2b4b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Los meses en <span className="text-amber-500 font-medium">naranja</span> tuvieron gastos 20%+ sobre el promedio
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab 4: Planificador de Quincena ─────────────────────────────────────────

const INPUT_STYLE = { color: "#111827", background: "#ffffff" }
const INPUT_CLS = "border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"

interface IncomeEntry  { id: string; date: string; amount: string; label: string }
interface PaymentEntry { id: string; date: string; amount: string; label: string }

function uid() { return Math.random().toString(36).slice(2, 9) }

function QuincenaTab() {
  const [saldoInicial, setSaldoInicial] = useState("")
  const [ingresos,  setIngresos]  = useState<IncomeEntry[]>([])
  const [pagos,     setPagos]     = useState<PaymentEntry[]>([])

  // form: ingreso
  const [iDate, setIDate] = useState("")
  const [iAmt,  setIAmt]  = useState("")
  const [iLbl,  setILbl]  = useState("")

  // form: pago
  const [pDate, setPDate] = useState("")
  const [pAmt,  setPAmt]  = useState("")
  const [pLbl,  setPLbl]  = useState("")

  // liquidador
  const [debtAmt,    setDebtAmt]    = useState("")
  const [debtMode,   setDebtMode]   = useState<"months" | "payment">("months")
  const [debtMonths, setDebtMonths] = useState("")
  const [debtPay,    setDebtPay]    = useState("")
  const [showDebt,   setShowDebt]   = useState(false)

  // ── helpers ──────────────────────────────────────────────────────────────
  const addIngreso = () => {
    if (!iDate || !iAmt) return
    setIngresos(p => [...p, { id: uid(), date: iDate, amount: iAmt, label: iLbl || "Quincena" }])
    setIDate(""); setIAmt(""); setILbl("")
  }
  const addPago = () => {
    if (!pDate || !pAmt) return
    setPagos(p => [...p, { id: uid(), date: pDate, amount: pAmt, label: pLbl || "Pago" }])
    setPDate(""); setPAmt(""); setPLbl("")
  }

  // Suggest next quincena dates (15th and last day of current/next month)
  const suggestDates = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const d15 = new Date(year, month, 15)
    const dEom = new Date(year, month + 1, 0)
    const d15n = new Date(year, month + 1, 15)
    const fmt = (d: Date) => d.toISOString().split("T")[0]
    return [fmt(d15 < now ? dEom : d15), fmt(dEom < now ? d15n : dEom)]
  }, [])

  // ── timeline ─────────────────────────────────────────────────────────────
  type Event = { id: string; date: string; label: string; amount: number; type: "income" | "payment"; running: number }

  const timeline = useMemo<Event[]>(() => {
    const events: Omit<Event, "running">[] = [
      ...ingresos.map(e => ({ id: e.id, date: e.date, label: e.label, amount: parseFloat(e.amount) || 0, type: "income" as const })),
      ...pagos.map(e => ({ id: e.id, date: e.date, label: e.label, amount: -(parseFloat(e.amount) || 0), type: "payment" as const })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    let running = parseFloat(saldoInicial.replace(",", ".")) || 0
    return events.map(e => {
      running += e.amount
      return { ...e, running }
    })
  }, [ingresos, pagos, saldoInicial])

  const minBalance = Math.min(...(timeline.length ? timeline.map(e => e.running) : [0]))

  // ── liquidador ────────────────────────────────────────────────────────────
  const debtAmtNum   = parseFloat(debtAmt.replace(",", "."))   || 0
  const debtMonthsN  = parseInt(debtMonths)   || 0
  const debtPayN     = parseFloat(debtPay.replace(",", "."))   || 0

  const quincenaPayment = debtMode === "months" && debtMonthsN > 0
    ? debtAmtNum / (debtMonthsN * 2)
    : 0
  const quincenasNeeded = debtMode === "payment" && debtPayN > 0
    ? Math.ceil(debtAmtNum / debtPayN)
    : 0
  const monthsNeeded = Math.ceil(quincenasNeeded / 2)

  const fmtDate = (d: string) => {
    if (!d) return ""
    const [y, m, day] = d.split("-")
    return `${day}/${m}/${y?.slice(2)}`
  }

  return (
    <div className="space-y-5">

      {/* Saldo inicial */}
      <div className="zoho-card rounded-xl p-4 flex items-center gap-4">
        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">Saldo inicial (opcional)</label>
          <p className="text-[10px] text-muted-foreground">Cuánto tienes ahora — la proyección parte desde aquí</p>
        </div>
        <input
          type="number" min={0} placeholder="$0.00"
          value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)}
          style={INPUT_STYLE}
          className={`w-32 text-right ${INPUT_CLS}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Ingresos */}
        <div className="zoho-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-semibold">Ingresos esperados</h3>
          </div>

          {/* Quick suggest */}
          <div className="flex gap-2 flex-wrap">
            {suggestDates.map(d => (
              <button key={d} onClick={() => setIDate(d)}
                className="text-[10px] border border-green-200 text-green-700 rounded-full px-2.5 py-0.5 hover:bg-green-50 transition-colors">
                + {fmtDate(d)}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="grid grid-cols-5 gap-1.5">
            <input type="date" value={iDate} onChange={e => setIDate(e.target.value)}
              style={INPUT_STYLE} className={`col-span-2 ${INPUT_CLS} text-xs px-2`} />
            <input type="number" min={0} placeholder="$" value={iAmt} onChange={e => setIAmt(e.target.value)}
              style={INPUT_STYLE} className={`col-span-1 ${INPUT_CLS} text-xs px-2`} />
            <input type="text" placeholder="Etiqueta" value={iLbl} onChange={e => setILbl(e.target.value)}
              style={INPUT_STYLE} className={`col-span-1 ${INPUT_CLS} text-xs px-2`} />
            <button onClick={addIngreso}
              className="col-span-1 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center justify-center transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {ingresos.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-3">Sin ingresos agregados</p>
              : ingresos.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <span className="text-xs font-medium">{e.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{fmtDate(e.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-green-600">+{formatCurrency(parseFloat(e.amount) || 0)}</span>
                    <button onClick={() => setIngresos(p => p.filter(x => x.id !== e.id))}
                      className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Pagos */}
        <div className="zoho-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold">Compromisos de pago</h3>
          </div>

          {/* Form */}
          <div className="grid grid-cols-5 gap-1.5">
            <input type="date" value={pDate} onChange={e => setPDate(e.target.value)}
              style={INPUT_STYLE} className={`col-span-2 ${INPUT_CLS} text-xs px-2`} />
            <input type="number" min={0} placeholder="$" value={pAmt} onChange={e => setPAmt(e.target.value)}
              style={INPUT_STYLE} className={`col-span-1 ${INPUT_CLS} text-xs px-2`} />
            <input type="text" placeholder="Etiqueta" value={pLbl} onChange={e => setPLbl(e.target.value)}
              style={INPUT_STYLE} className={`col-span-1 ${INPUT_CLS} text-xs px-2`} />
            <button onClick={addPago}
              className="col-span-1 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {pagos.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-3">Sin pagos agregados</p>
              : pagos.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <span className="text-xs font-medium">{e.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{fmtDate(e.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-500">−{formatCurrency(parseFloat(e.amount) || 0)}</span>
                    <button onClick={() => setPagos(p => p.filter(x => x.id !== e.id))}
                      className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="zoho-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Flujo proyectado
            </h3>
            {minBalance < 0 && (
              <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Saldo negativo en algún punto
              </span>
            )}
          </div>

          {/* overflow-x-auto para que en móvil la tabla haga scroll horizontal en lugar de romper el layout */}
          <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[420px] divide-y divide-border">
            {/* Header */}
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span className="col-span-2">Fecha</span>
              <span className="col-span-4">Concepto</span>
              <span className="col-span-3 text-right">Movimiento</span>
              <span className="col-span-3 text-right">Saldo</span>
            </div>

            {/* Starting balance row */}
            {parseFloat(saldoInicial) > 0 && (
              <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/20 text-xs">
                <span className="col-span-2 text-muted-foreground">Hoy</span>
                <span className="col-span-4 text-muted-foreground italic">Saldo inicial</span>
                <span className="col-span-3" />
                <span className="col-span-3 text-right font-semibold">{formatCurrency(parseFloat(saldoInicial) || 0)}</span>
              </div>
            )}

            {timeline.map(ev => {
              const isNeg = ev.running < 0
              const bgCls = isNeg
                ? "bg-red-50"
                : ev.type === "income" ? "bg-green-50/60" : ""
              return (
                <div key={ev.id}
                  className={cn("grid grid-cols-12 gap-1 px-3 py-2.5 text-xs items-center", bgCls)}>
                  <span className="col-span-2 text-muted-foreground font-mono whitespace-nowrap">{fmtDate(ev.date)}</span>
                  <span className="col-span-4 font-medium truncate flex items-center gap-1">
                    {ev.type === "income"
                      ? <ArrowUpCircle className="h-3 w-3 text-green-500 shrink-0" />
                      : <ArrowDownCircle className="h-3 w-3 text-red-400 shrink-0" />
                    }
                    {ev.label}
                  </span>
                  <span className={cn("col-span-3 text-right font-semibold whitespace-nowrap",
                    ev.type === "income" ? "text-green-600" : "text-red-500")}>
                    {ev.type === "income" ? "+" : "−"}{formatCurrency(Math.abs(ev.amount))}
                  </span>
                  <span className={cn("col-span-3 text-right font-bold whitespace-nowrap",
                    isNeg ? "text-red-600" : ev.running > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {isNeg && <AlertTriangle className="h-3 w-3 inline mr-0.5 mb-0.5" />}
                    {formatCurrency(ev.running)}
                  </span>
                </div>
              )
            })}
          </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg bg-green-50 border border-green-100 p-2 sm:p-3 text-center overflow-hidden">
              <p className="text-[9px] sm:text-[10px] text-green-700 truncate">Total ingresos</p>
              <p className="text-xs sm:text-sm font-bold text-green-700 tabular-nums">
                {formatCurrency(ingresos.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-2 sm:p-3 text-center overflow-hidden">
              <p className="text-[9px] sm:text-[10px] text-red-600 truncate">Total compromisos</p>
              <p className="text-xs sm:text-sm font-bold text-red-600 tabular-nums">
                {formatCurrency(pagos.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}
              </p>
            </div>
            <div className={cn("rounded-lg border p-2 sm:p-3 text-center overflow-hidden",
              timeline[timeline.length - 1]?.running >= 0
                ? "bg-blue-50 border-blue-100"
                : "bg-red-50 border-red-200")}>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">Saldo final</p>
              <p className={cn("text-xs sm:text-sm font-bold tabular-nums",
                timeline[timeline.length - 1]?.running >= 0 ? "text-blue-700" : "text-red-600")}>
                {formatCurrency(timeline[timeline.length - 1]?.running ?? 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {timeline.length === 0 && (
        <div className="zoho-card rounded-xl p-6 text-center text-sm text-muted-foreground">
          Agrega al menos un ingreso o pago para ver el flujo proyectado
        </div>
      )}

      {/* Liquidador de deuda */}
      <div className="zoho-card rounded-xl overflow-hidden">
        <button onClick={() => setShowDebt(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Liquidador de deuda a tu ritmo</span>
          </div>
          {showDebt ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showDebt && (
          <div className="px-4 pb-4 space-y-4 border-t border-border">
            <p className="text-xs text-muted-foreground pt-3">
              Calcula cuánto debes pagar por quincena para liquidar una deuda, o en cuánto tiempo la liquidas si pagas una cantidad fija.
            </p>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                onClick={() => setDebtMode("months")}
                className={cn("flex-1 py-2 text-xs font-medium transition-colors",
                  debtMode === "months" ? "bg-primary text-white" : "hover:bg-muted/40")}>
                Quiero pagarlo en X meses
              </button>
              <button
                onClick={() => setDebtMode("payment")}
                className={cn("flex-1 py-2 text-xs font-medium transition-colors",
                  debtMode === "payment" ? "bg-primary text-white" : "hover:bg-muted/40")}>
                Puedo pagar $X por quincena
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Monto total de la deuda ($)</label>
                <input type="number" min={0} placeholder="ej: 2000" value={debtAmt}
                  onChange={e => setDebtAmt(e.target.value)}
                  style={INPUT_STYLE} className={`w-full ${INPUT_CLS}`} />
              </div>
              {debtMode === "months" ? (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Plazo (meses)</label>
                  <input type="number" min={1} placeholder="ej: 12" value={debtMonths}
                    onChange={e => setDebtMonths(e.target.value)}
                    style={INPUT_STYLE} className={`w-full ${INPUT_CLS}`} />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Pago por quincena ($)</label>
                  <input type="number" min={1} placeholder="ej: 100" value={debtPay}
                    onChange={e => setDebtPay(e.target.value)}
                    style={INPUT_STYLE} className={`w-full ${INPUT_CLS}`} />
                </div>
              )}
            </div>

            {/* Result */}
            {debtAmtNum > 0 && (
              debtMode === "months" && debtMonthsN > 0 ? (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 sm:p-4 grid grid-cols-3 gap-2 sm:gap-4 text-center">
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Pago por quincena</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700 tabular-nums">{formatCurrency(quincenaPayment)}</p>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Pago mensual</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700 tabular-nums">{formatCurrency(quincenaPayment * 2)}</p>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Quincenas totales</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700">{debtMonthsN * 2}</p>
                  </div>
                </div>
              ) : debtMode === "payment" && debtPayN > 0 ? (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 sm:p-4 grid grid-cols-3 gap-2 sm:gap-4 text-center">
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Quincenas necesarias</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700">{quincenasNeeded}</p>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Meses aproximados</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700">{monthsNeeded}</p>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] text-indigo-600 truncate">Total a pagar</p>
                    <p className="text-sm sm:text-xl font-bold text-indigo-700 tabular-nums">{formatCurrency(quincenasNeeded * debtPayN)}</p>
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type TabId = "runway" | "escenarios" | "estacionalidad" | "quincena"

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  {
    id: "runway",
    label: "Días restantes",
    icon: Clock,
    desc: "¿Cuánto te dura el saldo actual?",
  },
  {
    id: "escenarios",
    label: "¿Qué pasa si...?",
    icon: Sliders,
    desc: "Simula reducciones y metas",
  },
  {
    id: "estacionalidad",
    label: "Ciclos anuales",
    icon: CalendarDays,
    desc: "Detecta patrones y proyecta",
  },
  {
    id: "quincena",
    label: "Planificador de quincena",
    icon: Banknote,
    desc: "Proyecta tus quincenas y pagos",
  },
]

export default function SimulacionesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("runway")

  const { data: aggregated, isLoading } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
  })

  const noData = !isLoading && (!aggregated || aggregated.total_transactions === 0)

  const totalMonths = aggregated?.monthly_trend?.length ?? 1

  return (
    <ProGate
      feature="Simulaciones"
      description="Explora escenarios de runway, ¿qué pasa si...?, ciclos anuales y planificador de quincena usando tus datos reales."
    >
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Simulaciones
          </h1>
          <p className="page-subtitle">Explora escenarios financieros basados en tus datos reales</p>
        </div>
      </div>

      <Disclaimer />

      {isLoading && (
        <div className="zoho-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          Cargando tus datos...
        </div>
      )}

      {noData && (
        <div className="zoho-card rounded-xl p-8 text-center space-y-2">
          <Info className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Sube al menos un estado de cuenta</p>
          <p className="text-xs text-muted-foreground">
            Las simulaciones necesitan tus datos históricos para calcular promedios y proyecciones.
          </p>
        </div>
      )}

      {!isLoading && !noData && aggregated && (
        <>
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "rounded-xl p-4 text-left border transition-all",
                    isActive
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}>
                      {tab.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tab.desc}</p>
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="animate-fade-up">
            {activeTab === "runway" && (
              <RunwayTab
                trend={aggregated.monthly_trend}
                totalExpenses={aggregated.total_expenses}
                totalMonths={totalMonths}
              />
            )}
            {activeTab === "escenarios" && (
              <EscenariosTab
                categories={aggregated.categories}
                merchants={aggregated.top_merchants}
                totalMonths={totalMonths}
              />
            )}
            {activeTab === "estacionalidad" && (
              <EstacionalidadTab trend={aggregated.monthly_trend} />
            )}
            {activeTab === "quincena" && <QuincenaTab />}
          </div>

          {/* Bottom note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground pb-4">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Todos los cálculos son aproximaciones basadas en promedios de tu historial.
              No se garantiza precisión ni se debe usar como base para decisiones financieras formales.
            </span>
          </div>
        </>
      )}
    </div>
    </ProGate>
  )
}
