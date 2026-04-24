/**
 * ManualEntryPage — Entrada manual estilo Finadyx
 * Flujo: seleccionar tipo (gasto/ingreso) → categoría → monto con numpad → agregar
 */
import { useState, useEffect } from "react"
import {
  ShoppingCart, Home, Zap, Droplets, Wifi, Phone, Bus, Flame,
  Heart, BookOpen, Shield, UtensilsCrossed, Film, ShoppingBag,
  RefreshCw, Gamepad2, Shirt, Laptop, Dumbbell, Play, Coffee,
  Beer, Cat, CreditCard, AlertCircle, PiggyBank, TrendingUp,
  ArrowLeftRight, MoreHorizontal, Trash2, Loader2, ChevronLeft,
  CheckCircle2, Briefcase, FileText, Percent, Gift, Store, Tag,
  BarChart2, RotateCcw, CalendarDays,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  createManualTransaction,
  listManualTransactions,
  deleteManualTransaction,
} from "@/api/manual"
import type { Transaction } from "@/types"
import { formatCurrency, cn } from "@/lib/utils"

// ─── Configuración de categorías ──────────────────────────────────────────────

interface CategoryConfig {
  label: string
  icon: LucideIcon
  color: string      // hex del ícono y borde activo
  bg: string         // bg claro para el círculo
  section: string
  type: "gasto" | "ingreso" | "ambos"
}

const CATEGORIES: Record<string, CategoryConfig> = {
  // ── Gastos: Necesidades ───────────────────────────────────────────────────
  supermercado:    { label: "Supermercado",    icon: ShoppingCart,    color: "#6366F1", bg: "#EEF2FF", section: "Necesidades",      type: "gasto" },
  alimentacion:    { label: "Alimentación",    icon: ShoppingBag,     color: "#8B5CF6", bg: "#F3F0FF", section: "Necesidades",      type: "gasto" },
  alquiler:        { label: "Alquiler",        icon: Home,            color: "#3B82F6", bg: "#EFF6FF", section: "Necesidades",      type: "gasto" },
  hipoteca:        { label: "Hipoteca",        icon: Home,            color: "#2563EB", bg: "#DBEAFE", section: "Necesidades",      type: "gasto" },
  servicios:       { label: "Servicios",       icon: Zap,             color: "#F59E0B", bg: "#FFFBEB", section: "Necesidades",      type: "gasto" },
  agua:            { label: "Agua",            icon: Droplets,        color: "#0EA5E9", bg: "#F0F9FF", section: "Necesidades",      type: "gasto" },
  luz:             { label: "Luz",             icon: Zap,             color: "#EAB308", bg: "#FEFCE8", section: "Necesidades",      type: "gasto" },
  internet:        { label: "Internet",        icon: Wifi,            color: "#6366F1", bg: "#EEF2FF", section: "Necesidades",      type: "gasto" },
  telefono:        { label: "Teléfono",        icon: Phone,           color: "#8B5CF6", bg: "#F3F0FF", section: "Necesidades",      type: "gasto" },
  transporte:      { label: "Transporte",      icon: Bus,             color: "#0D9488", bg: "#F0FDFA", section: "Necesidades",      type: "gasto" },
  gasolina:        { label: "Gasolina",        icon: Flame,           color: "#F97316", bg: "#FFF7ED", section: "Necesidades",      type: "gasto" },
  salud:           { label: "Salud",           icon: Heart,           color: "#10B981", bg: "#ECFDF5", section: "Necesidades",      type: "gasto" },
  educacion:       { label: "Educación",       icon: BookOpen,        color: "#6366F1", bg: "#EEF2FF", section: "Necesidades",      type: "gasto" },
  hogar:           { label: "Hogar",           icon: Home,            color: "#7C3AED", bg: "#EDE9FE", section: "Necesidades",      type: "gasto" },
  seguro:          { label: "Seguro",          icon: Shield,          color: "#3B82F6", bg: "#EFF6FF", section: "Necesidades",      type: "gasto" },
  // ── Gastos: Deseos ────────────────────────────────────────────────────────
  restaurantes:    { label: "Restaurantes",    icon: UtensilsCrossed, color: "#EC4899", bg: "#FDF2F8", section: "Deseos",           type: "gasto" },
  entretenimiento: { label: "Entretenim.",     icon: Film,            color: "#1D4ED8", bg: "#DBEAFE", section: "Deseos",           type: "gasto" },
  compras:         { label: "Compras",         icon: ShoppingBag,     color: "#F97316", bg: "#FFF7ED", section: "Deseos",           type: "gasto" },
  suscripciones:   { label: "Suscripciones",   icon: RefreshCw,       color: "#8B5CF6", bg: "#F3F0FF", section: "Deseos",           type: "gasto" },
  ocio:            { label: "Ocio",            icon: Gamepad2,        color: "#EC4899", bg: "#FDF2F8", section: "Deseos",           type: "gasto" },
  ropa:            { label: "Ropa",            icon: Shirt,           color: "#CA8A04", bg: "#FEF9C3", section: "Deseos",           type: "gasto" },
  tecnologia:      { label: "Tecnología",      icon: Laptop,          color: "#1D4ED8", bg: "#DBEAFE", section: "Deseos",           type: "gasto" },
  deporte:         { label: "Deporte",         icon: Dumbbell,        color: "#10B981", bg: "#ECFDF5", section: "Deseos",           type: "gasto" },
  streaming:       { label: "Streaming",       icon: Play,            color: "#DC2626", bg: "#FEF2F2", section: "Deseos",           type: "gasto" },
  cafe:            { label: "Café",            icon: Coffee,          color: "#92400E", bg: "#FEF3C7", section: "Deseos",           type: "gasto" },
  bares:           { label: "Bares",           icon: Beer,            color: "#F59E0B", bg: "#FFFBEB", section: "Deseos",           type: "gasto" },
  mascotas:        { label: "Mascotas",        icon: Cat,             color: "#065F46", bg: "#D1FAE5", section: "Deseos",           type: "gasto" },
  // ── Gastos: Financiero ────────────────────────────────────────────────────
  cargo_financiero:{ label: "Cargo banco",     icon: CreditCard,      color: "#6B7280", bg: "#F9FAFB", section: "Financiero",       type: "gasto" },
  deuda:           { label: "Deuda",           icon: AlertCircle,     color: "#DC2626", bg: "#FEF2F2", section: "Financiero",       type: "gasto" },
  // ── Ingresos: Trabajo ─────────────────────────────────────────────────────
  salario:         { label: "Salario",         icon: Briefcase,       color: "#16A34A", bg: "#F0FDF4", section: "Trabajo",          type: "ingreso" },
  honorarios:      { label: "Honorarios",      icon: FileText,        color: "#0D9488", bg: "#F0FDFA", section: "Trabajo",          type: "ingreso" },
  comision:        { label: "Comisión",        icon: Percent,         color: "#F59E0B", bg: "#FFFBEB", section: "Trabajo",          type: "ingreso" },
  bono:            { label: "Bono",            icon: Gift,            color: "#EC4899", bg: "#FDF2F8", section: "Trabajo",          type: "ingreso" },
  // ── Ingresos: Negocio ─────────────────────────────────────────────────────
  negocio:         { label: "Negocio",         icon: Store,           color: "#7C3AED", bg: "#EDE9FE", section: "Negocio",          type: "ingreso" },
  venta:           { label: "Venta",           icon: Tag,             color: "#F97316", bg: "#FFF7ED", section: "Negocio",          type: "ingreso" },
  // ── Ingresos: Pasivos ─────────────────────────────────────────────────────
  alquiler_cobrado:{ label: "Alquiler cobrado",icon: Home,            color: "#3B82F6", bg: "#EFF6FF", section: "Ingresos pasivos", type: "ingreso" },
  dividendos:      { label: "Dividendos",      icon: BarChart2,       color: "#6366F1", bg: "#EEF2FF", section: "Ingresos pasivos", type: "ingreso" },
  rendimiento:     { label: "Rendimiento",     icon: TrendingUp,      color: "#10B981", bg: "#ECFDF5", section: "Ingresos pasivos", type: "ingreso" },
  // ── Ingresos: Varios ──────────────────────────────────────────────────────
  reembolso:       { label: "Reembolso",       icon: RotateCcw,       color: "#0EA5E9", bg: "#F0F9FF", section: "Ingresos varios",  type: "ingreso" },
  regalo:          { label: "Regalo",          icon: Gift,            color: "#EC4899", bg: "#FDF2F8", section: "Ingresos varios",  type: "ingreso" },
  pension:         { label: "Pensión",         icon: CalendarDays,    color: "#6B7280", bg: "#F9FAFB", section: "Ingresos varios",  type: "ingreso" },
  otros_ingresos:  { label: "Otros ingresos",  icon: MoreHorizontal,  color: "#16A34A", bg: "#F0FDF4", section: "Ingresos varios",  type: "ingreso" },
  // ── Ambos tipos ───────────────────────────────────────────────────────────
  ahorro:          { label: "Ahorro",          icon: PiggyBank,       color: "#10B981", bg: "#ECFDF5", section: "Financiero",       type: "ambos" },
  inversion:       { label: "Inversión",       icon: TrendingUp,      color: "#3B82F6", bg: "#EFF6FF", section: "Financiero",       type: "ambos" },
  transferencias:  { label: "Transferencias",  icon: ArrowLeftRight,  color: "#8B5CF6", bg: "#F3F0FF", section: "Financiero",       type: "ambos" },
  otros:           { label: "Otros",           icon: MoreHorizontal,  color: "#6B7280", bg: "#F9FAFB", section: "Otros",            type: "gasto" },
}

const SECTIONS_GASTO   = ["Necesidades", "Deseos", "Financiero", "Otros"]
const SECTIONS_INGRESO = ["Trabajo", "Negocio", "Ingresos pasivos", "Ingresos varios", "Financiero"]

// ─── Sub-componente: Numpad ───────────────────────────────────────────────────

function Numpad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function press(key: string) {
    if (key === "⌫") {
      onChange(value.length > 1 ? value.slice(0, -1) : "0")
      return
    }
    if (key === ".") {
      if (value.includes(".")) return
      onChange(value + ".")
      return
    }
    if (value === "0" && key !== ".") {
      onChange(key)
      return
    }
    // Máximo 2 decimales
    const parts = value.split(".")
    if (parts[1] !== undefined && parts[1].length >= 2) return
    // Máximo 8 dígitos enteros
    if (parts[0].length >= 8 && parts[1] === undefined) return
    onChange(value + key)
  }

  const keys = [["7","8","9"], ["4","5","6"], ["1","2","3"], [".","0","⌫"]]

  return (
    <div className="grid gap-2">
      {keys.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-2">
          {row.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className={cn(
                "h-14 rounded-xl text-xl font-semibold transition-all active:scale-95",
                k === "⌫"
                  ? "bg-red-50 text-red-500 hover:bg-red-100"
                  : "bg-white text-foreground shadow-sm border border-border hover:bg-gray-50"
              )}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Sub-componente: Selector de categoría (overlay) ─────────────────────────

function CategoryPicker({
  selected,
  movType,
  onSelect,
  onClose,
}: {
  selected: string
  movType: "debito" | "credito"
  onSelect: (cat: string) => void
  onClose: () => void
}) {
  const tipoRegistro = movType === "debito" ? "gasto" : "ingreso"
  const sections = movType === "debito" ? SECTIONS_GASTO : SECTIONS_INGRESO

  // Filtra las categorías que corresponden al tipo activo (o "ambos")
  const visibleCats = Object.entries(CATEGORIES).filter(
    ([, c]) => c.type === tipoRegistro || c.type === "ambos"
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-white">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-semibold">Seleccionar categoría</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mostrando categorías de{" "}
            <span className={cn(
              "font-semibold",
              movType === "debito" ? "text-destructive" : "text-green-600"
            )}>
              {movType === "debito" ? "💸 gasto" : "💰 ingreso"}
            </span>
          </p>
        </div>
      </div>

      {/* Grid por secciones */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {sections.map((section) => {
          const cats = visibleCats.filter(([, c]) => c.section === section)
          if (cats.length === 0) return null
          return (
            <div key={section}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {cats.map(([key, cfg]) => {
                  const Icon = cfg.icon
                  const isActive = selected === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { onSelect(key); onClose() }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all",
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-white hover:border-border"
                      )}
                    >
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full"
                        style={{ background: cfg.bg }}
                      >
                        <Icon className="h-6 w-6" style={{ color: cfg.color }} />
                      </div>
                      <span className="text-xs text-center leading-tight line-clamp-2">{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type View = "entry" | "history" | "category"

export default function ManualEntryPage() {
  const [view, setView] = useState<View>("entry")
  const [movType, setMovType] = useState<"debito" | "credito">("debito")
  const [amount, setAmount]   = useState("0")
  const [category, setCategory] = useState("")
  const [detail, setDetail]   = useState("")
  const today = new Date().toISOString().split("T")[0]
  const [txDate, setTxDate]   = useState(today)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState("")
  const [errorMsg, setErrorMsg]   = useState("")

  useEffect(() => { fetchTransactions() }, [])

  async function fetchTransactions() {
    setLoading(true)
    try { setTransactions(await listManualTransactions()) }
    catch { /* silent */ }
    finally { setLoading(false) }
  }

  async function handleSubmit() {
    setErrorMsg("")
    if (parseFloat(amount) <= 0) { setErrorMsg("Ingresa un monto válido"); return }
    if (!category) { setErrorMsg("Selecciona una categoría"); return }
    if (!detail.trim()) { setErrorMsg("Escribe una descripción"); return }

    setSaving(true)
    try {
      const newTxn = await createManualTransaction({
        date: txDate,
        detail: detail.trim(),
        amount: parseFloat(amount),
        movement_type: movType,
        budget_category: category,
        budget_role: "presupuestable",
        economic_type: movType === "debito" ? "gasto" : "ingreso",
      })
      setTransactions((prev) => [newTxn, ...prev])
      setAmount("0")
      setDetail("")
      setCategory("")
      setTxDate(today)
      setSuccessMsg("¡Transacción agregada!")
      setTimeout(() => setSuccessMsg(""), 2500)
    } catch {
      setErrorMsg("Error al guardar la transacción")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteManualTransaction(id)
      setTransactions((prev) => prev.filter((t) => t.transaction_id !== id))
    } catch { /* silent */ }
    finally { setDeletingId(null) }
  }

  const catCfg = category ? CATEGORIES[category] : null
  const CatIcon = catCfg?.icon
  const amountNum = parseFloat(amount) || 0
  const totalGastos   = transactions.filter((t) => t.movement_type === "debito").reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIngresos = transactions.filter((t) => t.movement_type === "credito").reduce((s, t) => s + Math.abs(t.amount), 0)

  // ─── Vista: Selector de categoría (pantalla completa) ────────────────────
  if (view === "category") {
    return (
      <CategoryPicker
        selected={category}
        movType={movType}
        onSelect={setCategory}
        onClose={() => setView("entry")}
      />
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Entrada Manual</h1>
          <p className="page-subtitle">Registra gastos e ingresos sin subir estado de cuenta</p>
        </div>
        <button
          onClick={() => setView(view === "history" ? "entry" : "history")}
          className="text-xs text-primary font-semibold hover:underline"
        >
          {view === "history" ? "← Agregar" : `Historial (${transactions.length})`}
        </button>
      </div>

      {/* ── Vista: Historial ── */}
      {view === "history" && (
        <div className="space-y-3">
          {/* Resumen */}
          {transactions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="zoho-card p-4 border-0">
                <p className="text-xs text-muted-foreground">Total gastos</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(totalGastos)}</p>
              </div>
              <div className="zoho-card p-4 border-0">
                <p className="text-xs text-muted-foreground">Total ingresos</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalIngresos)}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="zoho-card border-0 p-10 text-center text-muted-foreground">
              <p className="font-medium">No hay entradas manuales aún</p>
              <p className="text-xs mt-1">Agrega tu primera transacción desde el formulario</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => {
                const cfg = txn.budget_category ? CATEGORIES[txn.budget_category] : null
                const TxIcon = cfg?.icon ?? MoreHorizontal
                return (
                  <div
                    key={txn.transaction_id}
                    className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-border/50"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{ background: cfg?.bg ?? "#F9FAFB" }}
                    >
                      <TxIcon className="h-5 w-5" style={{ color: cfg?.color ?? "#6B7280" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{txn.detail}</p>
                      <p className="text-xs text-muted-foreground">{txn.date} · {cfg?.label ?? txn.budget_category}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-sm font-bold",
                        txn.movement_type === "debito" ? "text-destructive" : "text-green-600"
                      )}>
                        {txn.movement_type === "debito" ? "-" : "+"}{formatCurrency(Math.abs(txn.amount))}
                      </span>
                      <button
                        onClick={() => handleDelete(txn.transaction_id)}
                        disabled={!!deletingId}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                      >
                        {deletingId === txn.transaction_id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vista: Formulario de entrada ── */}
      {view === "entry" && (
        <div className="space-y-4">

          {/* ── Toggle Gasto / Ingreso ── */}
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <button
              type="button"
              onClick={() => { if (movType !== "debito") { setMovType("debito"); setCategory(""); setDetail("") } }}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                movType === "debito"
                  ? "bg-white text-destructive shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              💸 Gasto
            </button>
            <button
              type="button"
              onClick={() => { if (movType !== "credito") { setMovType("credito"); setCategory(""); setDetail("") } }}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                movType === "credito"
                  ? "bg-white text-green-600 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              💰 Ingreso
            </button>
          </div>

          {/* ── Panel principal: monto + categoría ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">

            {/* Fila: categoría + fecha */}
            <div className="flex items-stretch border-b border-border/40">
              {/* Botón categoría */}
              <button
                type="button"
                onClick={() => setView("category")}
                className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-r border-border/40"
              >
                {catCfg && CatIcon ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: catCfg.bg }}>
                    <CatIcon className="h-5 w-5" style={{ color: catCfg.color }} />
                  </div>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="text-left min-w-0">
                  <p className="text-xs text-muted-foreground leading-none mb-0.5">Categoría</p>
                  <p className={cn("text-sm font-semibold truncate", !catCfg && "text-muted-foreground")}>
                    {catCfg ? catCfg.label : "Seleccionar →"}
                  </p>
                </div>
              </button>

              {/* Fecha */}
              <div className="px-3 py-3 flex flex-col justify-center">
                <p className="text-xs text-muted-foreground leading-none mb-0.5">Fecha</p>
                <input
                  type="date"
                  value={txDate}
                  max={today}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="text-sm font-semibold bg-transparent border-none outline-none w-[130px]"
                />
              </div>
            </div>

            {/* Monto grande */}
            <div className="px-6 py-5 text-center">
              <p className="text-5xl font-bold tracking-tight" style={{
                color: movType === "debito" ? "#DC2626" : "#16A34A"
              }}>
                B/. {amount}
              </p>
            </div>

            {/* Descripción */}
            <div className="px-4 pb-4">
              <input
                type="text"
                placeholder="Descripción (ej: Riba Smith, ESSO Villa Lucre…)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* ── Numpad ── */}
          <div className="bg-muted/30 rounded-2xl p-4">
            <Numpad value={amount} onChange={setAmount} />
          </div>

          {/* ── Mensajes ── */}
          {errorMsg && (
            <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{errorMsg}</div>
          )}
          {successMsg && (
            <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {successMsg}
            </div>
          )}

          {/* ── Botón agregar ── */}
          <button
            type="button"
            disabled={saving || amountNum <= 0}
            onClick={handleSubmit}
            className={cn(
              "w-full py-4 rounded-2xl text-white font-bold text-base transition-all shadow-md",
              saving || amountNum <= 0
                ? "bg-muted-foreground/30 cursor-not-allowed"
                : movType === "debito"
                  ? "bg-destructive hover:bg-destructive/90 active:scale-95"
                  : "bg-green-600 hover:bg-green-700 active:scale-95"
            )}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Guardando…
              </span>
            ) : (
              `Agregar ${movType === "debito" ? "gasto" : "ingreso"} · B/. ${amount}`
            )}
          </button>
        </div>
      )}
    </div>
  )
}
