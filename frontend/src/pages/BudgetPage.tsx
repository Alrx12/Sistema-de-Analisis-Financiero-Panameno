import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts"
import {
  Shield, TrendingDown, Sparkles, Target, BookOpen,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info,
  Pencil, Plus, Trash2, X,
} from "lucide-react"
import { getAggregatedSummary } from "@/api/analysis"
import { getProfile, updateProfile } from "@/api/profile"
import type { AggregatedSummary, UserProfile, GoalType, ManualExpense, ExpenseFrequency, ExpenseOrigin } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"

// ─── Mapeo de categorías a cubetas 50/30/20 ───────────────────────────────────

const NEEDS_CATEGORIES = new Set([
  "alimentacion", "comida", "vivienda", "alquiler", "hipoteca",
  "servicios", "servicios_basicos", "agua", "luz", "internet", "telefono",
  "transporte", "gasolina", "salud", "farmacia", "educacion",
  "supermercado", "hogar", "seguro",
])

const WANTS_CATEGORIES = new Set([
  "restaurantes", "entretenimiento", "compras", "viajes", "suscripciones",
  "ocio", "belleza", "mascotas", "ropa", "tecnologia", "deporte",
  "streaming", "cafe", "bares",
])

const SAVINGS_CATEGORIES = new Set([
  "ahorro", "inversion", "cargo_financiero", "deuda", "pension",
  "gasto_financiero",
])

type BucketKey = "needs" | "wants" | "savings" | "other"

interface Bucket {
  key: BucketKey
  label: string
  target_pct: number
  color: string
  emoji: string
  actual: number
  categories: { name: string; amount: number }[]
}

function classifyCategories(
  categories: Record<string, number>
): Omit<Bucket, "label" | "target_pct" | "color" | "emoji">[] {
  const buckets: Record<BucketKey, { actual: number; categories: { name: string; amount: number }[] }> = {
    needs:   { actual: 0, categories: [] },
    wants:   { actual: 0, categories: [] },
    savings: { actual: 0, categories: [] },
    other:   { actual: 0, categories: [] },
  }

  for (const [cat, amount] of Object.entries(categories)) {
    const normalized = cat.toLowerCase()
    let key: BucketKey = "other"
    if (NEEDS_CATEGORIES.has(normalized)) key = "needs"
    else if (WANTS_CATEGORIES.has(normalized)) key = "wants"
    else if (SAVINGS_CATEGORIES.has(normalized)) key = "savings"

    buckets[key].actual += amount
    buckets[key].categories.push({ name: cat, amount })
  }

  // Ordenar categorías por monto desc dentro de cada cubeta
  for (const b of Object.values(buckets)) {
    b.categories.sort((a, b) => b.amount - a.amount)
  }

  return [
    { key: "needs",   ...buckets.needs },
    { key: "wants",   ...buckets.wants },
    { key: "savings", ...buckets.savings },
    { key: "other",   ...buckets.other },
  ]
}

const BUCKET_META: Record<BucketKey, { label: string; target_pct: number; color: string; emoji: string }> = {
  needs:   { label: "Necesidades",        target_pct: 50, color: "#6366f1", emoji: "🏠" },
  wants:   { label: "Deseos",             target_pct: 30, color: "#f59e0b", emoji: "🎉" },
  savings: { label: "Ahorro / Deuda",     target_pct: 20, color: "#10b981", emoji: "🐖" },
  other:   { label: "Sin clasificar",     target_pct: 0,  color: "#94a3b8", emoji: "❓" },
}

// ─── Gastos adicionales ───────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  weekly:  "Semanal",
  monthly: "Mensual",
  annual:  "Anual",
}

const ORIGIN_LABELS: Record<ExpenseOrigin, string> = {
  efectivo:        "Efectivo",
  otro_banco:      "Otro banco",
  tarjeta_externa: "Tarjeta externa",
  prestamo:        "Préstamo",
  otro:            "Otro",
}

const ALL_ORIGINS: ExpenseOrigin[] = ["efectivo", "otro_banco", "tarjeta_externa", "prestamo", "otro"]

const EXPENSE_CATEGORIES = [
  // Necesidades
  "alquiler", "hipoteca", "alimentacion", "supermercado", "servicios",
  "agua", "luz", "internet", "telefono", "transporte", "gasolina", "salud", "educacion",
  // Deseos
  "restaurantes", "entretenimiento", "compras", "suscripciones", "ocio", "ropa",
  // Ahorro / Deuda
  "deuda", "ahorro", "inversion",
  // Otro
  "otro",
]

function toMonthly(amount: number, freq: ExpenseFrequency): number {
  if (freq === "weekly")  return amount * 4.33
  if (freq === "annual")  return amount / 12
  return amount
}

function newExpense(): ManualExpense {
  return {
    id: crypto.randomUUID(),
    description: "",
    amount: 0,
    frequency: "monthly",
    monthly_amount: 0,
    category: "otro",
    origins: [],
  }
}

const GOAL_LABELS: Record<GoalType, string> = {
  fondo_emergencia: "🛡️ Fondo de emergencia",
  ahorro_general:   "🐖 Ahorrar más",
  eliminar_deuda:   "✂️ Eliminar deudas",
  invertir:         "📈 Invertir",
  meta_especifica:  "🎯 Meta específica",
}

// ─── Guía educativa ───────────────────────────────────────────────────────────

const EDUCATION_SECTIONS = [
  {
    title: "¿Qué es la regla 50/30/20?",
    icon: BookOpen,
    content: `La regla 50/30/20 es un marco simple para organizar tu dinero en tres grupos.
El 50% de tu ingreso va a necesidades — las cosas que no puedes evitar pagar: comida, vivienda,
servicios básicos, transporte al trabajo. El 30% va a deseos — cosas que quieres pero no son
estrictamente necesarias: comer fuera, suscripciones, compras. El 20% va a ahorro y deudas —
construir tu futuro y eliminar lo que te debes a otros.`,
  },
  {
    title: "¿Por qué el 20% en ahorro es clave?",
    icon: Shield,
    content: `El ahorro no es lo que queda después de gastar — es lo primero que debes separar.
"Págarte a ti mismo primero" significa que apenas llega tu ingreso, el 20% va directo a una
cuenta de ahorro o a pagar deudas. Si esperas ver qué sobra, casi nunca sobra nada.
Un fondo de emergencia de 3–6 meses te protege de perder el auto, el apartamento, o peor,
endeudarte a tasas altas cuando surge algo inesperado.`,
  },
  {
    title: "¿Por qué mis categorías no encajan exactamente?",
    icon: Info,
    content: `La regla 50/30/20 es una guía, no una camisa de fuerza. Si tu costo de vivienda en
Panamá representa el 40% de tu ingreso, no es una falla — es tu contexto. Lo importante es
conocer tus números reales, entender dónde vas sobre el objetivo, y tomar decisiones conscientes.
Quizás no puedas bajar la vivienda, pero sí puedes auditar las suscripciones o comer fuera
menos veces al mes.`,
  },
  {
    title: "¿Cómo mejorar mi clasificación?",
    icon: Sparkles,
    content: `Si ves mucho gasto en "Sin clasificar", significa que el sistema aún no conoce esos
merchants. Ve a la sección Transacciones, filtra por "Requiere revisión", y usa Reclasificar
para corregirlos. Cada corrección entrena el sistema — la próxima vez que suba ese estado de
cuenta, esas transacciones llegarán ya categorizadas.`,
  },
]

// ─── Componente principal ──────────────────────────────────────────────────────

export default function BudgetPage() {
  const navigate = useNavigate()
  const [aggregated, setAggregated] = useState<AggregatedSummary | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [openEdu, setOpenEdu] = useState<number | null>(0)

  // Modal de gastos adicionales
  const [showModal, setShowModal] = useState(false)
  const [draftExpenses, setDraftExpenses] = useState<ManualExpense[]>([])
  const [savingExpenses, setSavingExpenses] = useState(false)

  useEffect(() => {
    Promise.all([getAggregatedSummary({}), getProfile()])
      .then(([agg, prof]) => {
        setAggregated(agg)
        setProfile(prof)
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveManualExpenses(expenses: ManualExpense[]) {
    if (!profile) return
    setSavingExpenses(true)
    try {
      const updated = await updateProfile({
        industry: profile.industry,
        expected_monthly_income: profile.expected_monthly_income,
        financial_goals: profile.financial_goals as GoalType[],
        onboarding_completed: profile.onboarding_completed,
        manual_expenses: expenses,
      })
      setProfile(updated)
      setShowModal(false)
    } finally {
      setSavingExpenses(false)
    }
  }

  function openEditModal() {
    setDraftExpenses(profile?.manual_expenses?.length ? [...profile.manual_expenses] : [newExpense()])
    setShowModal(true)
  }

  // Gastos adicionales normalizados a mensual
  const manualMonthly = useMemo(() => {
    return (profile?.manual_expenses ?? []).reduce((sum, e) => sum + (e.monthly_amount ?? 0), 0)
  }, [profile])

  const buckets = useMemo<Bucket[]>(() => {
    if (!aggregated) return []
    // Merge categorías de estados de cuenta + gastos adicionales
    const mergedCategories = { ...aggregated.categories }
    for (const exp of profile?.manual_expenses ?? []) {
      const cat = exp.category.toLowerCase()
      mergedCategories[cat] = (mergedCategories[cat] ?? 0) + (exp.monthly_amount ?? 0)
    }
    const classified = classifyCategories(mergedCategories)
    return classified.map((b) => ({
      ...b,
      ...BUCKET_META[b.key],
    }))
  }, [aggregated, profile])

  const totalExpenses = (aggregated?.total_expenses ?? 0) + manualMonthly
  const totalIncome = aggregated?.total_income ?? 0
  const expectedIncome = profile?.expected_monthly_income

  // Base para calcular porcentajes: usamos ingreso esperado si está disponible, si no el real
  const incomeBase = expectedIncome ?? totalIncome

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Calculando tu presupuesto…
      </div>
    )
  }

  if (!aggregated || totalExpenses === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mi Presupuesto</h1>
          <p className="text-sm text-muted-foreground">Análisis 50/30/20 de tus finanzas</p>
        </div>
        <Card>
          <CardContent className="pt-6 text-center space-y-4 py-12">
            <TrendingDown className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Sin datos para analizar</p>
            <p className="text-sm text-muted-foreground">
              Sube un estado de cuenta para ver tu análisis de presupuesto.
            </p>
            <Button onClick={() => navigate("/upload")}>Subir estado de cuenta</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const needsBucket   = buckets.find((b) => b.key === "needs")!
  const wantsBucket   = buckets.find((b) => b.key === "wants")!
  const savingsBucket = buckets.find((b) => b.key === "savings")!
  const otherBucket   = buckets.find((b) => b.key === "other")!

  // Para el PieChart (excluye "other" si es 0)
  const pieData = buckets
    .filter((b) => b.actual > 0)
    .map((b) => ({ name: b.label, value: b.actual, color: b.color }))

  // Para el BarChart comparativo: real vs objetivo
  const barData = [needsBucket, wantsBucket, savingsBucket].map((b) => ({
    name: b.label,
    Real: b.actual,
    Objetivo: incomeBase > 0 ? Math.round(incomeBase * (b.target_pct / 100)) : 0,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-8">

      {/* ── Modal de gastos adicionales ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-base font-semibold">Gastos no registrados en tus estados</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Efectivo, otro banco, deudas fuera del sistema — inclúyelos para un presupuesto real.
                </p>
              </div>
              <button onClick={() => saveManualExpenses([])} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {draftExpenses.map((exp, idx) => (
                <div key={exp.id} className="rounded-lg border p-4 space-y-3 relative">
                  <button
                    className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
                    onClick={() => setDraftExpenses(draftExpenses.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                    <Input
                      placeholder="ej: Alquiler en efectivo, cuota préstamo personal…"
                      value={exp.description}
                      onChange={(e) => {
                        const updated = [...draftExpenses]
                        updated[idx] = { ...exp, description: e.target.value }
                        setDraftExpenses(updated)
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Monto</label>
                      <Input
                        type="number"
                        min={0}
                        value={exp.amount || ""}
                        placeholder="0.00"
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0
                          const updated = [...draftExpenses]
                          updated[idx] = { ...exp, amount, monthly_amount: toMonthly(amount, exp.frequency) }
                          setDraftExpenses(updated)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Frecuencia</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={exp.frequency}
                        onChange={(e) => {
                          const frequency = e.target.value as ExpenseFrequency
                          const updated = [...draftExpenses]
                          updated[idx] = { ...exp, frequency, monthly_amount: toMonthly(exp.amount, frequency) }
                          setDraftExpenses(updated)
                        }}
                      >
                        {(["weekly", "monthly", "annual"] as ExpenseFrequency[]).map((f) => (
                          <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={exp.category}
                      onChange={(e) => {
                        const updated = [...draftExpenses]
                        updated[idx] = { ...exp, category: e.target.value }
                        setDraftExpenses(updated)
                      }}
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Origen(es)</label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_ORIGINS.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => {
                            const updated = [...draftExpenses]
                            const origins = exp.origins.includes(o)
                              ? exp.origins.filter((x) => x !== o)
                              : [...exp.origins, o]
                            updated[idx] = { ...exp, origins }
                            setDraftExpenses(updated)
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            exp.origins.includes(o)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          )}
                        >
                          {ORIGIN_LABELS[o]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {exp.amount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ≈ {formatCurrency(exp.monthly_amount)}/mes
                    </p>
                  )}
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => setDraftExpenses([...draftExpenses, newExpense()])}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar otro gasto
              </Button>
            </div>

            <div className="flex items-center justify-between p-5 border-t gap-3">
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => saveManualExpenses([])}
              >
                No tengo gastos adicionales
              </button>
              <Button
                onClick={() => saveManualExpenses(draftExpenses.filter((e) => e.amount > 0 && e.description))}
                disabled={savingExpenses}
              >
                {savingExpenses ? "Guardando…" : "Guardar y continuar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner gastos adicionales (solo si nunca se ha configurado) ── */}
      {profile?.manual_expenses === null && (
        <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <span>¿Tienes gastos fuera del banco (efectivo, deudas, otro banco)? Inclúyelos para un presupuesto más real.</span>
          <button
            className="ml-4 shrink-0 text-primary hover:underline font-medium"
            onClick={openEditModal}
          >
            Configurar
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi Presupuesto</h1>
          <p className="text-sm text-muted-foreground">
            Análisis 50/30/20 · {aggregated.total_transactions.toLocaleString()} transacciones
            {manualMonthly > 0 && ` + ${formatCurrency(manualMonthly)}/mes adicionales`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEditModal}>
            <Plus className="h-3 w-3 mr-1.5" /> Gastos adicionales
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/onboarding")}>
            <Pencil className="h-3 w-3 mr-1.5" /> Editar perfil
          </Button>
        </div>
      </div>

      {/* Metas del usuario */}
      {profile?.financial_goals && profile.financial_goals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">Tus metas:</span>
          {profile.financial_goals.map((g) => (
            <Badge key={g} variant="secondary" className="text-xs">
              {GOAL_LABELS[g as GoalType] ?? g}
            </Badge>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Ingresos totales" value={formatCurrency(totalIncome)} color="green" />
        <KpiCard label="Gastos totales" value={formatCurrency(totalExpenses)} color="red" />
        <KpiCard
          label="Balance"
          value={formatCurrency(totalIncome - totalExpenses)}
          color={totalIncome - totalExpenses >= 0 ? "green" : "red"}
        />
        {expectedIncome ? (
          <KpiCard label="Ingreso esperado" value={formatCurrency(expectedIncome)} color="blue" />
        ) : (
          <KpiCard
            label="Tasa de ahorro"
            value={totalIncome > 0 ? `${((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1)}%` : "—"}
            color="blue"
          />
        )}
      </div>

      {/* Distribución 50/30/20 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribución de gastos — Regla 50/30/20</CardTitle>
          <p className="text-xs text-muted-foreground">
            {incomeBase > 0
              ? `Basado en ${expectedIncome ? "tu ingreso esperado" : "tus ingresos detectados"} de ${formatCurrency(incomeBase)}`
              : "Basado en tus gastos totales"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {[needsBucket, wantsBucket, savingsBucket, otherBucket].map((bucket) => {
            if (bucket.key === "other" && bucket.actual === 0) return null
            const actualPct = incomeBase > 0 ? (bucket.actual / incomeBase) * 100 : 0
            const targetPct = bucket.target_pct
            const over = targetPct > 0 && actualPct > targetPct
            const under = targetPct > 0 && actualPct < targetPct * 0.8

            return (
              <div key={bucket.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {bucket.emoji} {bucket.label}
                    {targetPct > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (meta: {targetPct}%)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold tabular-nums", over ? "text-destructive" : under ? "text-emerald-600" : "")}>
                      {actualPct.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground text-xs">{formatCurrency(bucket.actual)}</span>
                    {over && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                    {under && targetPct > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                </div>
                {/* Barra de progreso */}
                <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(actualPct, 100)}%`,
                      backgroundColor: bucket.color,
                      opacity: over ? 1 : 0.8,
                    }}
                  />
                  {targetPct > 0 && (
                    <div
                      className="absolute top-0 h-full w-0.5 bg-foreground/30"
                      style={{ left: `${Math.min(targetPct, 100)}%` }}
                      title={`Meta: ${targetPct}%`}
                    />
                  )}
                </div>
                {/* Detalle de categorías */}
                {bucket.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-1">
                    {bucket.categories.slice(0, 5).map((c) => (
                      <span key={c.name} className="text-xs text-muted-foreground">
                        {c.name} ({formatCurrency(c.amount)})
                        {bucket.categories.indexOf(c) < Math.min(4, bucket.categories.length - 1) ? " ·" : ""}
                      </span>
                    ))}
                    {bucket.categories.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{bucket.categories.length - 5} más</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* PieChart: distribución real */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribución real</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* BarChart: real vs objetivo */}
        {incomeBase > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Real vs Objetivo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="Real" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Objetivo" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recomendaciones específicas de metas */}
      {profile?.financial_goals && profile.financial_goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Acciones para tus metas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.financial_goals.includes("fondo_emergencia") && (
              <GoalActionCard
                emoji="🛡️"
                title="Fondo de emergencia"
                type="warning"
                steps={[
                  `Tu meta: cubrir 3 meses de gastos (${formatCurrency(totalExpenses * 3)}).`,
                  "Abre una cuenta de ahorro separada — no la mezcles con tu cuenta corriente.",
                  "Automatiza una transferencia fija el día que llega tu salario.",
                  "Empieza con $50–$100/mes si es lo que puedes. El hábito vale más que el monto.",
                ]}
              />
            )}
            {profile.financial_goals.includes("eliminar_deuda") && (
              <GoalActionCard
                emoji="✂️"
                title="Eliminar deudas"
                type="info"
                steps={[
                  "Lista todas tus deudas con su tasa de interés.",
                  "Método avalancha: paga mínimos en todas y el extra en la de mayor tasa.",
                  "Método bola de nieve: paga primero la más pequeña para ganar impulso psicológico.",
                  "Revisa tus cargos bancarios — comisiones altas son deuda disfrazada.",
                ]}
              />
            )}
            {profile.financial_goals.includes("ahorro_general") && (
              <GoalActionCard
                emoji="🐖"
                title="Aumentar tu ahorro"
                type="success"
                steps={[
                  `Con tu ingreso actual, la meta del 20% es ${formatCurrency(totalIncome * 0.2)} al mes.`,
                  "Identifica tus 3 mayores gastos en 'Deseos' — ahí está el margen de maniobra.",
                  "Cancela las suscripciones que no usas — revisa la columna 'recurrente' en Transacciones.",
                  "Cada aumento de salario: destina la mitad del incremento a ahorro antes de acostumbrarte a gastarlo.",
                ]}
              />
            )}
            {profile.financial_goals.includes("invertir") && (
              <GoalActionCard
                emoji="📈"
                title="Empezar a invertir"
                type="info"
                steps={[
                  "Primero consolida: fondo de emergencia de 3 meses antes de invertir.",
                  "Empieza con instrumentos simples: cuentas de ahorro de alto rendimiento, fondos de inversión diversificados.",
                  "No inviertas lo que vas a necesitar en menos de 1 año.",
                  "Diversifica: no pongas todo en el mismo instrumento.",
                ]}
              />
            )}
            {profile.financial_goals.includes("meta_especifica") && (
              <GoalActionCard
                emoji="🎯"
                title="Meta específica"
                type="info"
                steps={[
                  "Define el monto exacto que necesitas y la fecha límite.",
                  "Calcula cuánto tienes que ahorrar por mes: monto ÷ meses restantes.",
                  "Abre una cuenta etiquetada para esa meta — el dinero separado no se gasta.",
                  "Revisa el progreso cada mes y ajusta si es necesario.",
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Guía educativa 50/30/20 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Guía: Cómo usar la regla 50/30/20
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {EDUCATION_SECTIONS.map((section, i) => (
            <div key={i} className="border rounded-md overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors"
                onClick={() => setOpenEdu(openEdu === i ? null : i)}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                  {section.title}
                </div>
                {openEdu === i ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {openEdu === i && (
                <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground whitespace-pre-line">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, color,
}: { label: string; value: string; color: "green" | "red" | "blue" }) {
  const colors = {
    green: "text-emerald-700",
    red:   "text-destructive",
    blue:  "text-primary",
  }
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${colors[color]}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function GoalActionCard({
  emoji, title, type, steps,
}: { emoji: string; title: string; type: "warning" | "info" | "success"; steps: string[] }) {
  const styles = {
    warning: "border-amber-200 bg-amber-50",
    info:    "border-blue-200 bg-blue-50",
    success: "border-emerald-200 bg-emerald-50",
  }
  return (
    <div className={`rounded-md border p-4 space-y-2 ${styles[type]}`}>
      <p className="text-sm font-semibold">{emoji} {title}</p>
      <ul className="space-y-1">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-0.5 text-xs font-bold text-foreground/40">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Helper para cn (evitar import circular si lib/utils lo necesita)
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ")
}
