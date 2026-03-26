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

export default function TransactionsPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [filterReview, setFilterReview] = useState(
    searchParams.get("requires_review") === "true"
  )
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", id, filterReview],
    queryFn: () => getTransactions(id!, filterReview ? { requires_review: true } : undefined),
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

  const filtered = transactions.filter((t) =>
    search === "" ||
    t.detail.toLowerCase().includes(search.toLowerCase()) ||
    (t.budget_category ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/analysis/${id}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Transacciones</h1>
          <p className="text-sm text-muted-foreground">{transactions.length} en total</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por descripción o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant={filterReview ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterReview(!filterReview)}
        >
          <Filter className="h-3 w-3" />
          {filterReview ? "Mostrar todas" : "Solo requieren revisión"}
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
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

  const isIncome = tx.economic_type === "ingreso" || tx.movement_type === "credito"

  return (
    <Card className={cn(tx.requires_review && "border-yellow-300")}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", economicTypeBadgeClass(tx.economic_type ?? ""))}>
                {capitalize(tx.economic_type ?? tx.movement_type)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
              {tx.requires_review && (
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              )}
            </div>
            <p className="mt-1 text-sm font-medium" title={tx.detail}>{truncate(tx.detail, 50)}</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{capitalize(tx.budget_category ?? "sin categoría")}</span>
              <span className={cn("text-xs font-medium", confidenceColor(tx.confidence))}>
                {(tx.confidence * 100).toFixed(0)}% conf.
              </span>
            </div>
          </div>

          {/* Monto + acciones */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={cn("text-base font-bold", isIncome ? "text-green-600" : "text-red-500")}>
              {isIncome ? "+" : "-"}{formatCurrency(Math.abs(tx.amount))}
            </span>
            <Button variant="outline" size="sm" onClick={onEdit}>
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
                  onChange={(e) => setForm({ ...form, economic_type: e.target.value })}
                >
                  {["ingreso", "gasto", "cargo_financiero", "transferencia_propia", "transferencia_tercero", "reembolso"].map((v) => (
                    <option key={v} value={v}>{capitalize(v)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Categoría de presupuesto">
                <Input
                  value={form.budget_category}
                  onChange={(e) => setForm({ ...form, budget_category: e.target.value })}
                  placeholder="ej: restaurantes, supermercado…"
                />
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
