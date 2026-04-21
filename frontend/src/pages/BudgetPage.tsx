import { useState, useMemo, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts"
import {
  Shield, TrendingDown, Sparkles, Target, BookOpen,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info,
  Pencil, Plus, Trash2, X, SlidersHorizontal,
} from "lucide-react"
import { getAggregatedSummary } from "@/api/analysis"
import { getProfile, updateProfile } from "@/api/profile"
import type { AggregatedSummary, UserProfile, GoalType, ManualExpense, ExpenseFrequency, ExpenseOrigin, EmploymentType } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency, capitalize } from "@/lib/utils"

// ─── Mapeo de categorías a cubetas 50/30/20 ───────────────────────────────────

// Aliases: normaliza categorías duplicadas o con variantes antes de clasificar.
// Clave: nombre en minúsculas tal como viene de la DB. Valor: nombre canónico.
const CATEGORY_ALIASES: Record<string, string> = {
  "deuda":               "deudas",       // singular → plural canónico
  "restaurante":         "restaurantes",
  "suscripcion":         "suscripciones",
  "viaje":               "viajes",
  "comision":            "comisiones",   // unificar con el plural
  "impuesto":            "impuestos",
  "impuestos y comisiones": "impuestos", // categoría compuesta → canónica
  "mercado":             "supermercado", // fusionar con supermercado
}

const NEEDS_CATEGORIES = new Set([
  "alimentacion", "comida", "mercado", "vivienda", "alquiler", "hipoteca",
  "servicios", "servicios_basicos", "agua", "luz", "internet", "telefono",
  "transporte", "gasolina", "salud", "farmacia", "educacion",
  "supermercado", "hogar", "seguro", "higiene", "renta",
])

const WANTS_CATEGORIES = new Set([
  "restaurantes", "restaurante", "entretenimiento", "compras", "viajes", "viaje",
  "suscripciones", "suscripcion", "ocio", "belleza", "mascotas", "ropa",
  "tecnologia", "deporte", "gym", "streaming", "cafe", "bares", "cine",
  // Transferencias a terceros son gastos reales, no ahorro
  "transferencias",
])

const SAVINGS_CATEGORIES = new Set([
  "ahorro", "inversion", "cargo_financiero", "deudas", "pension",
  "gasto_financiero", "comisiones", "financiero", "prestamo", "credito",
  // Impuestos y comisiones bancarias: obligaciones financieras inevitables
  "impuestos", "impuesto", "comision",
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

  // Paso 1: fusionar aliases (ej. "deuda" + "deudas" → "deudas" con monto sumado)
  const merged: Record<string, number> = {}
  for (const [cat, amount] of Object.entries(categories)) {
    const key = CATEGORY_ALIASES[cat.toLowerCase()] ?? cat.toLowerCase()
    merged[key] = (merged[key] ?? 0) + amount
  }

  // Paso 2: clasificar en cubetas
  for (const [cat, amount] of Object.entries(merged)) {
    let bucket: BucketKey = "other"
    if (NEEDS_CATEGORIES.has(cat))   bucket = "needs"
    else if (WANTS_CATEGORIES.has(cat))   bucket = "wants"
    else if (SAVINGS_CATEGORIES.has(cat)) bucket = "savings"

    buckets[bucket].actual += amount
    buckets[bucket].categories.push({ name: cat, amount })
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

// ─── Targets personalizados ───────────────────────────────────────────────────

interface AdjustedTargets {
  needs: number
  wants: number
  savings: number
  adjustments: string[]
}

function getAdjustedTargets(profile: UserProfile | null | undefined): AdjustedTargets {
  let needs = 50
  let wants = 30
  let savings = 20
  const adjustments: string[] = []

  if (!profile) return { needs, wants, savings, adjustments }

  // Dependientes: cada dependiente sube necesidades (máx +9%)
  const deps = profile.dependents_count ?? 0
  if (deps >= 1) {
    const bump = Math.min(deps * 3, 9)
    needs += bump
    wants -= bump
    adjustments.push(`+${bump}% en necesidades por ${deps} dependiente${deps > 1 ? "s" : ""}`)
  }

  // Vivienda propia o familiar: menor carga fija de vivienda
  if (profile.housing_type === "own" || profile.housing_type === "family") {
    needs -= 5
    wants += 5
    adjustments.push("-5% en necesidades (vivienda propia sin pago mensual)")
  }

  // Ingresos variables o independientes: más colchón de ahorro.
  // Aplica si el tipo de empleo es variable/independiente, O si la industria es
  // Entretenimiento (actores, músicos, productores: ingresos por proyecto,
  // irregulares por naturaleza aunque no hayan completado el campo de empleo).
  const variableTypes: EmploymentType[] = ["employed_variable", "self_employed", "business_owner", "unemployed"]
  const isVariableIncome =
    (profile.employment_type != null && variableTypes.includes(profile.employment_type)) ||
    profile.industry === "entretenimiento"
  if (isVariableIncome) {
    savings += 5
    wants -= 5
    const reason = profile.industry === "entretenimiento" && !variableTypes.includes(profile.employment_type ?? "" as EmploymentType)
      ? "+5% en ahorro/reserva por ingresos variables (industria del entretenimiento)"
      : "+5% en ahorro/reserva por ingresos variables o propios"
    adjustments.push(reason)
  }

  // Deudas activas: incrementar meta de ahorro/deuda
  if ((profile.monthly_debt_payments ?? 0) > 0) {
    savings += 3
    wants -= 3
    adjustments.push("+3% en ahorro/deuda por pagos de deuda activos")
  }

  // Garantizar mínimos razonables
  wants   = Math.max(wants,   10)
  needs   = Math.max(needs,   30)
  savings = Math.max(savings, 10)

  // Normalizar a 100%
  const total = needs + wants + savings
  needs   = Math.round((needs   / total) * 100)
  savings = Math.round((savings / total) * 100)
  wants   = 100 - needs - savings

  return { needs, wants, savings, adjustments }
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

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
]

// Genera los últimos 18 meses como opciones
function recentMonths(n = 18) {
  const opts: { year: number; month: number; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` })
  }
  return opts
}

export default function BudgetPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [openEdu, setOpenEdu] = useState<number | null>(0)

  // Filtro de mes — por defecto el mes actual (se auto-ajusta si no hay datos)
  const now = new Date()
  const [selectedYear,  setSelectedYear]  = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1)
  const monthOptions = recentMonths(18)
  const autoSelectedRef = useRef(false)  // evita ciclos al auto-seleccionar mes

  // Buckets expandidos (para ver todas las categorías)
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())
  const toggleBucket = (key: string) =>
    setExpandedBuckets(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  // Modal de gastos adicionales
  const [showModal, setShowModal] = useState(false)
  const [draftExpenses, setDraftExpenses] = useState<ManualExpense[]>([])

  // ── Datos del servidor vía TanStack Query (reaccionan a invalidaciones) ──────
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  // Query sin filtro de mes → para descubrir qué meses tienen datos
  const { data: allTimeData } = useQuery<AggregatedSummary>({
    queryKey: ["aggregated", "all"],
    queryFn: () => getAggregatedSummary({}),
  })

  const { data: aggregated, isLoading: aggLoading } = useQuery<AggregatedSummary>({
    queryKey: ["aggregated", selectedYear, selectedMonth],
    queryFn: () => getAggregatedSummary({ year: selectedYear, month: selectedMonth }),
  })

  // Auto-seleccionar el último mes disponible si el mes actual no tiene datos
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (!allTimeData?.monthly_trend?.length) return

    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const trend = allTimeData.monthly_trend
    const currentHasData = trend.some(
      m => m.month === currentMonthKey && (m.income > 0 || m.expenses > 0)
    )
    if (currentHasData) {
      autoSelectedRef.current = true
      return
    }
    // Mes actual sin datos → buscar el más reciente con datos
    const withData = trend.filter(m => m.income > 0 || m.expenses > 0)
    if (withData.length > 0) {
      const latest = withData[withData.length - 1]
      const [y, mo] = latest.month.split("-").map(Number)
      setSelectedYear(y)
      setSelectedMonth(mo)
    }
    autoSelectedRef.current = true
  }, [allTimeData])  // eslint-disable-line react-hooks/exhaustive-deps

  const loading = profileLoading || aggLoading

  // ── Guardar gastos adicionales — solo envía manual_expenses (exclude_unset en backend) ─
  const saveExpensesMutation = useMutation({
    mutationFn: (expenses: ManualExpense[]) =>
      updateProfile({ manual_expenses: expenses }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      queryClient.invalidateQueries({ queryKey: ["aggregated"] })
      setShowModal(false)
    },
  })

  function saveManualExpenses(expenses: ManualExpense[]) {
    saveExpensesMutation.mutate(expenses)
  }

  function openEditModal() {
    setDraftExpenses(profile?.manual_expenses?.length ? [...profile.manual_expenses] : [newExpense()])
    setShowModal(true)
  }

  // Gastos adicionales normalizados a mensual
  const manualMonthly = useMemo(() => {
    return (profile?.manual_expenses ?? []).reduce((sum, e) => sum + (e.monthly_amount ?? 0), 0)
  }, [profile])

  // Targets personalizados según perfil extendido
  const adjustedTargets = useMemo(() => getAdjustedTargets(profile), [profile])

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
      // Sobreescribir con targets personalizados
      target_pct:
        b.key === "needs"   ? adjustedTargets.needs
        : b.key === "wants"   ? adjustedTargets.wants
        : b.key === "savings" ? adjustedTargets.savings
        : 0,
    }))
  }, [aggregated, profile, adjustedTargets])

  const totalExpenses = (aggregated?.total_expenses ?? 0) + manualMonthly
  const totalIncome = aggregated?.total_income ?? 0
  const expectedIncome = profile?.expected_monthly_income

  // Base para calcular porcentajes: usamos ingreso esperado si está disponible, si no el real
  const incomeBase = expectedIncome ?? totalIncome

  // Balance real del mes y flag para lógica de "margen"
  const balance           = totalIncome - totalExpenses
  const isNegativeBalance = balance < 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Calculando tu presupuesto…
      </div>
    )
  }

  if (!aggregated || totalExpenses === 0) {
    const selectedMonthLabel = monthOptions.find(o => o.year === selectedYear && o.month === selectedMonth)?.label ?? ""
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mi Presupuesto</h1>
            <p className="text-sm text-muted-foreground">Análisis 50/30/20 de tus finanzas</p>
          </div>
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm self-start"
            value={`${selectedYear}-${selectedMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number)
              setSelectedYear(y)
              setSelectedMonth(m)
            }}
          >
            {monthOptions.map((o) => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Card>
          <CardContent className="pt-6 text-center space-y-4 py-12">
            <TrendingDown className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Sin datos para {selectedMonthLabel}</p>
            <p className="text-sm text-muted-foreground">
              No hay transacciones registradas en ese mes. Prueba seleccionar otro mes o sube un estado de cuenta.
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
    <div className="space-y-8">

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
                disabled={saveExpensesMutation.isPending}
              >
                {saveExpensesMutation.isPending ? "Guardando…" : "Guardar y continuar"}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi Presupuesto</h1>
          <p className="text-sm text-muted-foreground">
            Análisis 50/30/20 · {aggregated.total_transactions.toLocaleString()} transacciones
            {manualMonthly > 0 && ` + ${formatCurrency(manualMonthly)}/mes adicionales`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de mes */}
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={`${selectedYear}-${selectedMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number)
              setSelectedYear(y)
              setSelectedMonth(m)
            }}
          >
            {monthOptions.map((o) => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={openEditModal}>
            <Plus className="h-3 w-3 mr-1.5" /> Gastos adicionales
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/onboarding")}>
            <Pencil className="h-3 w-3 mr-1.5" /> Editar perfil
          </Button>
        </div>
      </div>

      {/* ── Banner de personalización ── */}
      {(() => {
        const hasExtended = !!(
          profile?.housing_type ||
          profile?.employment_type ||
          (profile?.dependents_count ?? 0) > 0 ||
          (profile?.monthly_debt_payments ?? 0) > 0
        )
        const hasBasic = !!(
          profile?.industry &&
          profile?.expected_monthly_income &&
          profile?.financial_goals?.length
        )

        if (adjustedTargets.adjustments.length > 0) {
          // Perfil extendido activo → mostrar qué ajustes se aplicaron
          return (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800">
                  Presupuesto personalizado activo — metas ajustadas a tu situación
                </p>
                <ul className="mt-1 space-y-0.5">
                  {adjustedTargets.adjustments.map((adj, i) => (
                    <li key={i} className="text-xs text-emerald-700/80">• {adj}</li>
                  ))}
                </ul>
                <button
                  className="mt-1.5 text-xs text-emerald-700 font-medium underline underline-offset-2 hover:no-underline"
                  onClick={() => navigate("/cuenta")}
                >
                  Actualizar datos del perfil →
                </button>
              </div>
            </div>
          )
        }

        if (!hasBasic || !hasExtended) {
          // Sin perfil extendido → invitar a configurarlo
          return (
            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-800">
                  Usando la regla estándar 50/30/20
                </p>
                <p className="text-xs text-indigo-700/80 mt-0.5 leading-relaxed">
                  ¿Tienes hijos, pagas alquiler/hipoteca, trabajas por cuenta propia o tienes deudas activas?
                  El modelo puede ajustar las metas automáticamente a tu realidad.{" "}
                  <button
                    className="font-semibold underline underline-offset-2 hover:no-underline"
                    onClick={() => navigate("/cuenta")}
                  >
                    Personalizar presupuesto →
                  </button>
                </p>
              </div>
            </div>
          )
        }

        return null
      })()}

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

      {/* ── Banner balance negativo ── */}
      {isNegativeBalance && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">
                ⚠️ Balance actual negativo: {formatCurrency(balance)}
              </p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                Gastaste {formatCurrency(Math.abs(balance))} más de lo que ingresaste este mes.
                El análisis 50/30/20 de abajo está proyectado sobre tu ingreso esperado
                de {formatCurrency(incomeBase)}, no tu ingreso real actual.
                El "margen disponible" que puedas ver en alguna categoría es <strong>teórico</strong> —
                primero hay que llevar el balance a cero.
              </p>
            </div>
          </div>
          <div className="pl-8 space-y-1.5">
            <p className="text-xs font-semibold text-red-800">Para recuperarte este mes:</p>
            <ul className="space-y-1.5">
              {[
                expectedIncome && totalIncome < expectedIncome
                  ? `Tienes ${formatCurrency(expectedIncome - totalIncome)} de ingreso esperado por llegar — cuando llegue, destina primero ${formatCurrency(Math.abs(balance))} a cubrir el déficit antes de cualquier gasto discrecional.`
                  : `Revisa si hay ingresos pendientes por cobrar o registrar — un ingreso adicional puede revertir el balance.`,
                needsBucket.categories[0]
                  ? `Tu categoría más alta es "${capitalize(needsBucket.categories[0].name)}" (${formatCurrency(needsBucket.categories[0].amount)}) — revisa si hay restaurantes o compras clasificados ahí que podrían moverse a Deseos y darte más claridad.`
                  : `Revisa si algún gasto de Necesidades tiene categoría incorrecta — reclasificarlo da más visibilidad.`,
                `Pausa cualquier gasto en Deseos hasta que el balance vuelva a ser positivo.`,
                `Meta inmediata: cerrar el mes en $0 o mejor. Una vez en positivo, el margen que ves en las categorías sí será real.`,
              ].map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                  <span className="font-bold shrink-0 mt-0.5">{i + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Distribución 50/30/20 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribución de gastos — Regla 50/30/20</CardTitle>
          <p className="text-xs text-muted-foreground">
            {isNegativeBalance
              ? `Proyección sobre ingreso esperado de ${formatCurrency(incomeBase)} — balance real: ${formatCurrency(balance)}`
              : incomeBase > 0
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
            const isExpanded = expandedBuckets.has(bucket.key)
            const VISIBLE = 5
            const visibleCats = isExpanded ? bucket.categories : bucket.categories.slice(0, VISIBLE)
            const hidden = bucket.categories.length - VISIBLE
            const overAmount = incomeBase > 0 ? bucket.actual - (incomeBase * targetPct / 100) : 0
            const alertMsg = over
              ? `Llevas ${actualPct.toFixed(1)}% en ${bucket.label} — tu meta es ${targetPct}%. Eso es ${(actualPct - targetPct).toFixed(1)} puntos de más (${formatCurrency(overAmount)} sobre lo planeado). Revisa las categorías de abajo para recortar.`
              : under
              ? `Vas bien con ${bucket.label}: solo llevas ${actualPct.toFixed(1)}% de tu meta del ${targetPct}%. Tienes margen disponible.`
              : ""

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
                    {(over || under) && alertMsg && (
                      <span className="relative group cursor-help" style={{ lineHeight: 0 }}>
                        {over
                          ? <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        {/* Tooltip */}
                        <span
                          className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg px-3 py-2 text-xs leading-relaxed text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          style={{ background: "#1c2b4b", minWidth: "220px" }}
                        >
                          {alertMsg}
                        </span>
                      </span>
                    )}
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
                {/* Detalle de categorías — expandible */}
                {bucket.categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pl-1">
                    {visibleCats.map((c, i) => (
                      <span key={c.name} className="text-xs text-muted-foreground">
                        {c.name} ({formatCurrency(c.amount)})
                        {i < visibleCats.length - 1 || (hidden > 0 && !isExpanded) ? " ·" : ""}
                      </span>
                    ))}
                    {hidden > 0 && (
                      <button
                        className="text-xs font-medium text-primary hover:underline focus:outline-none"
                        onClick={() => toggleBucket(bucket.key)}
                      >
                        {isExpanded ? "ver menos ↑" : `+${hidden} más ↓`}
                      </button>
                    )}
                  </div>
                )}
                {/* CTA de corrección para "Sin clasificar" */}
                {bucket.key === "other" && bucket.actual > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        <span className="font-semibold">{formatCurrency(bucket.actual)}</span> en gastos sin categoría.
                        Corrígelos para que aparezcan en Necesidades, Deseos o Ahorro y tener un presupuesto preciso.
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                      onClick={() => navigate("/retrain")}
                    >
                      Corregir →
                    </button>
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
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  paddingAngle={2}
                  labelLine={false}
                  label={({ cx: lx, cy: ly, midAngle, innerRadius, outerRadius: or, percent }: {
                    cx: number; cy: number; midAngle: number
                    innerRadius: number; outerRadius: number; percent: number
                  }) => {
                    if (percent < 0.07) return null   // omite slices muy pequeños
                    const RADIAN = Math.PI / 180
                    const r = innerRadius + (or - innerRadius) * 0.55
                    const x = lx + r * Math.cos(-midAngle * RADIAN)
                    const y = ly + r * Math.sin(-midAngle * RADIAN)
                    return (
                      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
                        fontSize={12} fontWeight={700} style={{ pointerEvents: "none" }}>
                        {`${(percent * 100).toFixed(0)}%`}
                      </text>
                    )
                  }}
                >
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
                  <Bar dataKey="Real" fill="#6366f1" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="Real" position="top"
                      formatter={(v: number) => v > 0 ? `$${Math.round(v)}` : ""}
                      style={{ fontSize: 10, fill: "#6366f1", fontWeight: 700 }} />
                  </Bar>
                  <Bar dataKey="Objetivo" fill="#e2e8f0" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="Objetivo" position="top"
                      formatter={(v: number) => v > 0 ? `$${Math.round(v)}` : ""}
                      style={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Diagnóstico del mes ── */}
      {incomeBase > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              🔍 Diagnóstico del mes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Análisis automático basado en tus datos reales — qué está bien y qué ajustar para el próximo mes.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[needsBucket, wantsBucket, savingsBucket].map((bucket) => {
              const actualPct  = (bucket.actual / incomeBase) * 100
              const over       = bucket.target_pct > 0 && actualPct > bucket.target_pct
              const under      = bucket.target_pct > 0 && actualPct < bucket.target_pct * 0.85
              const overAmount = bucket.actual - (incomeBase * bucket.target_pct / 100)
              const margin     = (incomeBase * bucket.target_pct / 100) - bucket.actual
              const diffPts    = actualPct - bucket.target_pct
              const topCat     = bucket.categories[0]

              // Detectar si savings incluye cargo_financiero grande (posible doble conteo TDC)
              const finCat = bucket.key === "savings"
                ? bucket.categories.find((c) =>
                    c.name.toLowerCase().includes("financiero") ||
                    c.name.toLowerCase().includes("cargo") ||
                    c.name.toLowerCase().includes("comisi")
                  )
                : undefined
              const hasFinDobleConteo = !!(finCat && finCat.amount > bucket.actual * 0.25)

              // Cuando el balance es negativo, "under" no es motivo de celebración
              const underWithNegBalance = under && isNegativeBalance

              let icon     = "🟡"
              let colorCls = "border-amber-200 bg-amber-50/60"
              let textCls  = "text-amber-800"
              if (over)                   { icon = "🔴"; colorCls = "border-red-200 bg-red-50/60";         textCls = "text-red-800" }
              else if (underWithNegBalance){ icon = "⚠️"; colorCls = "border-orange-200 bg-orange-50/60";  textCls = "text-orange-800" }
              else if (under)             { icon = "✅"; colorCls = "border-emerald-200 bg-emerald-50/60"; textCls = "text-emerald-800" }

              // Titular
              let headline = ""
              if (underWithNegBalance) {
                headline = `${bucket.emoji} ${bucket.label} — ${actualPct.toFixed(1)}% de meta ${bucket.target_pct}% ⚠️ Balance negativo activo`
              } else if (under) {
                headline = `${bucket.emoji} ${bucket.label} — ${actualPct.toFixed(1)}% de meta ${bucket.target_pct}% ✅ Tienes margen`
              } else if (over) {
                headline = `${bucket.emoji} ${bucket.label} — ${actualPct.toFixed(1)}% vs meta ${bucket.target_pct}% (+${diffPts.toFixed(1)} pts, ${formatCurrency(overAmount)} de más)${hasFinDobleConteo ? " ⚠️ posible doble conteo" : ""}`
              } else {
                headline = `${bucket.emoji} ${bucket.label} — ${actualPct.toFixed(1)}% · dentro del rango 🟡`
              }

              // Cuerpo del análisis
              let body = ""
              let ctaText = ""
              let ctaHref = ""

              if (underWithNegBalance) {
                body = `Aunque no has gastado en ${bucket.label.toLowerCase()} (${actualPct.toFixed(1)}%), tu balance actual es ${formatCurrency(balance)}. El margen proyectado de ${formatCurrency(margin)} es teórico — en la práctica, ese dinero aún no existe porque los gastos superan lo ingresado. Espera a que el balance sea positivo antes de contar con ese margen.`
              } else if (under) {
                body = `Estás por debajo de tu meta. Tienes ${formatCurrency(margin)} disponibles antes de llegar al límite. Si aparece un gasto inesperado en ${bucket.label.toLowerCase()}, tienes cobertura. No necesitas cambiar nada aquí.`
              } else if (!over) {
                body = `Estás dentro de tu meta del ${bucket.target_pct}%. Buen control — sigue así.`
              } else if (bucket.key === "wants") {
                if (topCat) {
                  const topPct = bucket.actual > 0 ? ((topCat.amount / bucket.actual) * 100).toFixed(0) : 0
                  body = `El ítem dominante es ${capitalize(topCat.name)} con ${formatCurrency(topCat.amount)} (${topPct}% de tus Deseos). Reducir su frecuencia a la mitad puede recuperar ~${formatCurrency(topCat.amount * 0.4)} al mes.`
                  if (topCat.name.toLowerCase().includes("restaurante")) {
                    body += ` Regla práctica: cuando restaurantes supere $150 en el mes, el resto del mes comes en casa.`
                  } else if (topCat.name.toLowerCase().includes("suscripci")) {
                    body += ` Revisa cada suscripción activa — los servicios pequeños suman sin que te des cuenta.`
                  } else if (topCat.name.toLowerCase().includes("compra") || topCat.name.toLowerCase().includes("ropa")) {
                    body += ` Prueba la regla de las 48 horas: espera 2 días antes de cualquier compra no urgente.`
                  }
                } else {
                  body = `Estás ${formatCurrency(overAmount)} sobre tu meta de Deseos. Identifica los 2-3 ítems más altos y reduce su frecuencia el próximo mes.`
                }
                ctaText = "Revisar en Entrenamiento"
                ctaHref = "/retrain"
              } else if (bucket.key === "savings") {
                if (hasFinDobleConteo && finCat) {
                  body = `${formatCurrency(finCat.amount)} en "${capitalize(finCat.name)}" podría incluir pagos de tarjeta de crédito (TDC). Si es así, estás contando esos gastos dos veces: una cuando compraste y otra cuando pagaste la tarjeta. Reclasifica los pagos de TDC como "solo_balance" en Entrenamiento masivo para limpiar el número — el porcentaje real debería caer bastante.`
                  ctaText = "Ir a Entrenamiento"
                  ctaHref = "/retrain"
                } else if (topCat) {
                  body = `El ítem principal es ${capitalize(topCat.name)} con ${formatCurrency(topCat.amount)}. Estás ${formatCurrency(overAmount)} sobre la meta — revisa si alguna categoría de aquí incluye transferencias entre tus propias cuentas (eso sería doble conteo y habría que reclasificar como "solo_balance").`
                  ctaText = "Revisar en Entrenamiento"
                  ctaHref = "/retrain"
                }
              } else if (bucket.key === "needs") {
                if (topCat) {
                  body = `El ítem principal en Necesidades es ${capitalize(topCat.name)} con ${formatCurrency(topCat.amount)}. Las necesidades son difíciles de reducir. Si superan la meta, revisa si hay gastos clasificados aquí que realmente son Deseos (ej. salidas, entretenimiento) — reclasificarlos baja este número automáticamente.`
                } else {
                  body = `Necesidades está ${formatCurrency(overAmount)} sobre la meta. Revisa si hay categorías clasificadas aquí que en realidad son Deseos.`
                }
                ctaText = "Reclasificar"
                ctaHref = "/retrain"
              }

              return (
                <div key={bucket.key} className={`rounded-xl border p-4 ${colorCls}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5 shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold mb-1.5 ${textCls}`}>{headline}</p>
                      <p className="text-xs leading-relaxed text-gray-700">{body}</p>
                      {ctaText && (
                        <button
                          onClick={() => navigate(ctaHref)}
                          className="mt-2 text-xs font-bold text-white rounded-md px-3 py-1.5 transition-opacity hover:opacity-90"
                          style={{ background: "#e05c19" }}
                        >
                          {ctaText} →
                        </button>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xl font-extrabold ${over ? "text-red-600" : under ? "text-emerald-600" : "text-amber-600"}`}>
                        {actualPct.toFixed(1)}%
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">meta {bucket.target_pct}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

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
