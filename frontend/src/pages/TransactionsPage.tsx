import { useState, type ReactNode } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, CheckCircle2, AlertTriangle, Filter } from "lucide-react"
import { getTransactions, reclassifyTransaction } from "@/api/analysis"
import { toast } from "@/components/ui/toast"
import type { Transaction, ReclassifyRequest } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate, capitalize, confidenceColor, economicTypeBadgeClass, truncate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { CATEGORIES_BY_TYPE } from "@/lib/categories"

export default function TransactionsPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [filterReview, setFilterReview] = useState(
    searchParams.get("requires_review") === "true"
  )
  const [search, setSearch] = useState("")
  const [filterMovement, setFilterMovement] = useState<"all" | "credit" | "debit">("all")
  const [filterEtype, setFilterEtype] = useState<string>("all")
  const [editing, setEditing] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => getTransactions(id!),
    enabled: !!id,
  })

  const reclassify = useMutation({
    mutationFn: ({ txId, data }: { txId: string; data: ReclassifyRequest }) =>
      reclassifyTransaction(txId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", id] })
      queryClient.invalidateQueries({ queryKey: ["confidence-stats", id] })
      setEditing(null)
      toast("Transacción reclasificada correctamente", "success")
    },
    onError: () => {
      toast("Error al guardar la corrección", "error")
    },
  })

  const needsReview = (t: Transaction) =>
    t.requires_review ||
    t.budget_role === "revisar" ||
    (t.budget_category ?? "").toLowerCase().includes("desconocido")

  const filtered = transactions.filter((t) => {
    if (filterReview && !needsReview(t)) return false
    if (search !== "" &&
        !t.detail.toLowerCase().includes(search.toLowerCase()) &&
        !(t.budget_category ?? "").toLowerCase().includes(search.toLowerCase())) return false
    if (filterMovement !== "all" && t.movement_type !== filterMovement) return false
    if (filterEtype !== "all" && t.economic_type !== filterEtype) return false
    return true
  })

  const reviewCount = transactions.filter(needsReview).length

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
            <Link to={`/analysis/${id}`}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="page-title">Transacciones</h1>
            <p className="page-subtitle">
              {filtered.length !== transactions.length
                ? `${filtered.length} de ${transactions.length}`
                : `${transactions.length} en total`}
              {reviewCount > 0 && (
                <span className="ml-2 text-red-500 font-medium">· {reviewCount} requieren revisión</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filtros en pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search box */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 shadow-sm min-w-56">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            placeholder="Buscar descripción o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-auto border-0 p-0 shadow-none focus-visible:ring-0 text-sm"
          />
        </div>

        {/* Movimiento pills */}
        <button className={`filter-pill ${filterMovement === "all" ? "active" : ""}`}
          onClick={() => setFilterMovement("all")}>Todas</button>
        <button className={`filter-pill ${filterMovement === "credit" ? "active" : ""}`}
          onClick={() => setFilterMovement("credit")}>Solo créditos</button>
        <button className={`filter-pill ${filterMovement === "debit" ? "active" : ""}`}
          onClick={() => setFilterMovement("debit")}>Solo débitos</button>

        {/* Tipo económico select */}
        <select
          className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm cursor-pointer outline-none"
          value={filterEtype}
          onChange={(e) => setFilterEtype(e.target.value)}
        >
          <option value="all">Tipo económico</option>
          <option value="ingreso">Ingreso</option>
          <option value="gasto">Gasto</option>
          <option value="cargo_financiero">Cargo financiero</option>
          <option value="transferencia_propia">Transferencia propia</option>
          <option value="transferencia_tercero">Transferencia tercero</option>
          <option value="reembolso">Reembolso</option>
        </select>

        {/* Revisión pill */}
        <button
          className={`filter-pill ${filterReview ? "active" : ""}`}
          style={filterReview ? {} : { borderColor: "#ef4444", color: "#ef4444" }}
          onClick={() => setFilterReview(!filterReview)}
        >
          <AlertTriangle className="h-3 w-3" />
          {filterReview ? "Mostrar todas" : `Revisar (${reviewCount})`}
        </button>

        {(search || filterMovement !== "all" || filterEtype !== "all") && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={() => { setSearch(""); setFilterMovement("all"); setFilterEtype("all") }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-12 text-center text-muted-foreground shadow-sm">
          {filterReview ? "¡No hay transacciones pendientes de revisión!" : "No se encontraron resultados"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.transaction_id}
              tx={tx}
              isEditing={editing === tx.transaction_id}
              onEdit={() => setEditing(editing === tx.transaction_id ? null : tx.transaction_id)}
              onSave={(data) => reclassify.mutate({ txId: tx.transaction_id, data })}
              isSaving={reclassify.isPending && editing === tx.transaction_id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TransactionRow({
  tx, isEditing, onEdit, onSave, isSaving
}: {
  tx: Transaction
  isEditing: boolean
  onEdit: () => void
  onSave: (data: ReclassifyRequest) => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<ReclassifyRequest>({
    economic_type: tx.economic_type ?? "gasto",
    economic_type_detail: tx.economic_type_detail ?? "gasto_variable",
    subtype_economic: tx.subtype_economic ?? "desconocido",
    budget_category: tx.budget_category ?? "",
    budget_role: tx.budget_role ?? "revisar",
    also_learn: true,
  })

  const isIncome = tx.economic_type === "ingreso" || tx.movement_type === "credito" || tx.amount > 0
  const needsReview =
    tx.requires_review ||
    tx.budget_role === "revisar" ||
    (tx.budget_category ?? "").toLowerCase().includes("desconocido")

  return (
    <Card className={cn("zoho-card border-0 overflow-hidden")}
      style={needsReview ? { borderLeft: "3px solid #f59e0b" } : {}}>
      <CardContent className="pt-3.5 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          {/* Info principal */}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Fecha */}
            <span className="text-xs text-muted-foreground shrink-0 w-16">{formatDate(tx.date)}</span>

            {/* Descripción */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate" title={tx.detail}>
                  {truncate(tx.detail, 52)}
                </p>
                {(tx.requires_review || needsReview) && (
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", economicTypeBadgeClass(tx.economic_type ?? ""))}>
                  {capitalize(tx.economic_type ?? tx.movement_type)}
                </span>
                <span className="text-xs text-muted-foreground">{capitalize(tx.budget_category ?? "sin categoría")}</span>
                <span className={cn("text-xs font-medium", confidenceColor(tx.confidence))}>
                  {(tx.confidence * 100).toFixed(0)}% conf.
                </span>
              </div>
            </div>
          </div>

          {/* Monto + acciones */}
          <div className="flex items-center gap-3 shrink-0">
            <span className={cn("text-sm font-bold tabular-nums", isIncome ? "text-green-600" : "text-red-500")}>
              {isIncome ? "+" : "-"}{formatCurrency(Math.abs(tx.amount))}
            </span>
            <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onEdit}>
              {isEditing ? "Cancelar" : "Corregir"}
            </Button>
          </div>
        </div>

        {/* Formulario inline de reclasificación */}
        {isEditing && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Corregir clasificación
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo económico">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.economic_type}
                  onChange={(e) => {
                    // Al cambiar tipo, resetear la categoría para evitar valores inválidos
                    setForm({ ...form, economic_type: e.target.value, budget_category: "" })
                  }}
                >
                  {["ingreso", "gasto", "cargo_financiero", "transferencia_propia", "transferencia_tercero", "reembolso"].map((v) => (
                    <option key={v} value={v}>{capitalize(v)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Detalle económico">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.economic_type_detail}
                  onChange={(e) => setForm({ ...form, economic_type_detail: e.target.value })}
                >
                  {["gasto_variable", "gasto_recurrente", "salario", "otros_ingresos", "comision", "impuesto", "cargo_bancario", "transferencia_propia", "transferencia_tercero", "reembolso"].map((v) => (
                    <option key={v} value={v}>{capitalize(v)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Categoría de presupuesto">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.budget_category}
                  onChange={(e) => setForm({ ...form, budget_category: e.target.value })}
                >
                  <option value="">— Seleccionar —</option>
                  {(form.economic_type === "ingreso"
                    ? CATEGORIES_BY_TYPE.ingreso
                    : CATEGORIES_BY_TYPE.gasto
                  ).map((c) => (
                    <option key={c} value={c}>
                      {capitalize(c.replace(/_/g, " "))}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Subtipo">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.subtype_economic}
                  onChange={(e) => setForm({ ...form, subtype_economic: e.target.value })}
                >
                  {["recurrente", "extraordinario", "variable", "financiero", "desconocido"].map((v) => (
                    <option key={v} value={v}>{capitalize(v)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Rol en presupuesto">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.budget_role}
                  onChange={(e) => setForm({ ...form, budget_role: e.target.value })}
                >
                  {["presupuestable", "no_presupuestable", "gasto_operativo", "gasto_financiero", "ahorro_inversion", "solo_balance", "revisar"].map((v) => (
                    <option key={v} value={v}>{capitalize(v)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.also_learn}
                onChange={(e) => setForm({ ...form, also_learn: e.target.checked })}
              />
              Aprender esta corrección para el futuro
            </label>

            <Button
              size="sm"
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Guardar corrección
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
