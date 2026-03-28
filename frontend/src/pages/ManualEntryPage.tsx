import { useState, useEffect } from "react"
import { PlusCircle, Trash2, Loader2, FileText, TrendingDown, TrendingUp } from "lucide-react"
import {
  createManualTransaction,
  listManualTransactions,
  deleteManualTransaction,
} from "@/api/manual"
import type { Transaction } from "@/types"
import { BUDGET_CATEGORIES } from "@/lib/categories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, cn } from "@/lib/utils"

// ─── Mapa de categorías a etiquetas legibles ──────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  alimentacion: "Alimentación",
  supermercado: "Supermercado",
  alquiler: "Alquiler",
  hipoteca: "Hipoteca",
  servicios: "Servicios",
  agua: "Agua",
  luz: "Luz / Electricidad",
  internet: "Internet",
  telefono: "Teléfono",
  transporte: "Transporte",
  gasolina: "Gasolina",
  salud: "Salud / Médico",
  educacion: "Educación",
  hogar: "Hogar",
  seguro: "Seguro",
  restaurantes: "Restaurantes",
  entretenimiento: "Entretenimiento",
  compras: "Compras",
  suscripciones: "Suscripciones",
  ocio: "Ocio",
  ropa: "Ropa",
  tecnologia: "Tecnología",
  deporte: "Deporte",
  streaming: "Streaming",
  cafe: "Café",
  bares: "Bares",
  mascotas: "Mascotas",
  cargo_financiero: "Cargo Financiero",
  deuda: "Deuda / Préstamo",
  ahorro: "Ahorro",
  inversion: "Inversión",
  transferencias: "Transferencias",
  otros: "Otros",
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ManualEntryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // ─── Formulario ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0]
  const [form, setForm] = useState({
    date: today,
    detail: "",
    amount: "",
    movement_type: "debito" as "debito" | "credito",
    budget_category: "" as string,
  })

  useEffect(() => {
    fetchTransactions()
  }, [])

  async function fetchTransactions() {
    setLoading(true)
    try {
      const data = await listManualTransactions()
      setTransactions(data)
    } catch {
      setError("No se pudieron cargar las transacciones")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!form.detail.trim()) { setError("El nombre de la transacción es requerido"); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Ingresa un monto válido"); return }
    if (!form.budget_category) { setError("Selecciona una categoría"); return }
    if (!form.date) { setError("Selecciona una fecha"); return }

    setSaving(true)
    try {
      const newTxn = await createManualTransaction({
        date: form.date,
        detail: form.detail.trim(),
        amount: parseFloat(form.amount),
        movement_type: form.movement_type,
        budget_category: form.budget_category,
        budget_role: "presupuestable",
        economic_type: form.movement_type === "debito" ? "gasto" : "ingreso",
      })
      setTransactions((prev) => [newTxn, ...prev])
      setForm({ date: today, detail: "", amount: "", movement_type: "debito", budget_category: "" })
      setSuccess("Transacción agregada correctamente")
      setTimeout(() => setSuccess(""), 3000)
    } catch {
      setError("Error al guardar la transacción")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(transactionId: string) {
    setDeletingId(transactionId)
    try {
      await deleteManualTransaction(transactionId)
      setTransactions((prev) => prev.filter((t) => t.transaction_id !== transactionId))
    } catch {
      setError("No se pudo eliminar la transacción")
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Totales ─────────────────────────────────────────────────────────────────
  const totalDebitos = transactions.filter((t) => t.movement_type === "debito").reduce((s, t) => s + t.amount, 0)
  const totalCreditos = transactions.filter((t) => t.movement_type === "credito").reduce((s, t) => s + t.amount, 0)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Entrada Manual</h1>
          <p className="page-subtitle">Registra tus gastos e ingresos sin subir un estado de cuenta</p>
        </div>
      </div>

      {/* ─── Formulario de nueva transacción ─── */}
      <Card className="zoho-card border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />
            Nueva transacción
          </CardTitle>
          <CardDescription>
            Ingresa el nombre libremente. La categoría debe seleccionarse del catálogo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Fecha */}
              <div className="space-y-1.5">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  max={today}
                />
              </div>

              {/* Tipo de movimiento */}
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, movement_type: "debito" }))}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold transition-colors",
                      form.movement_type === "debito"
                        ? "bg-destructive text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Gasto (débito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, movement_type: "credito" }))}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold transition-colors border-l border-input",
                      form.movement_type === "credito"
                        ? "bg-green-600 text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Ingreso (crédito)
                  </button>
                </div>
              </div>
            </div>

            {/* Nombre / descripción — TEXTO LIBRE */}
            <div className="space-y-1.5">
              <Label htmlFor="detail">Nombre del movimiento <span className="text-xs text-muted-foreground">(texto libre)</span></Label>
              <Input
                id="detail"
                placeholder="Ej: Supermercado El Rey, Netflix, Farmacia, Gasolina…"
                value={form.detail}
                onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Monto */}
              <div className="space-y-1.5">
                <Label htmlFor="amount">Monto ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>

              {/* Categoría — SELECT DEL CATÁLOGO, no texto libre */}
              <div className="space-y-1.5">
                <Label htmlFor="category">Categoría <span className="text-xs text-muted-foreground">(del catálogo)</span></Label>
                <select
                  id="category"
                  value={form.budget_category}
                  onChange={(e) => setForm((f) => ({ ...f, budget_category: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">-- Selecciona --</option>
                  <optgroup label="Necesidades">
                    {(["alimentacion","supermercado","alquiler","hipoteca","servicios","agua","luz","internet","telefono","transporte","gasolina","salud","educacion","hogar","seguro"] as const).map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Deseos">
                    {(["restaurantes","entretenimiento","compras","suscripciones","ocio","ropa","tecnologia","deporte","streaming","cafe","bares","mascotas"] as const).map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Financiero">
                    {(["cargo_financiero","deuda","ahorro","inversion"] as const).map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Otros">
                    {(["transferencias","otros"] as const).map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            {success && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              {saving ? "Guardando…" : "Agregar transacción"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Resumen ─── */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="zoho-card border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs text-muted-foreground">Total gastos</span>
              </div>
              <p className="text-lg font-bold text-destructive mt-1">{formatCurrency(totalDebitos)}</p>
            </CardContent>
          </Card>
          <Card className="zoho-card border-0">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Total ingresos</span>
              </div>
              <p className="text-lg font-bold text-green-600 mt-1">{formatCurrency(totalCreditos)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Lista de transacciones ─── */}
      <Card className="zoho-card border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Historial de entradas manuales
            {transactions.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{transactions.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Cargando…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay entradas manuales aún</p>
              <p className="text-xs mt-1">Usa el formulario de arriba para agregar tu primera transacción</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <div
                  key={txn.transaction_id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white",
                        txn.movement_type === "debito" ? "bg-destructive/80" : "bg-green-500"
                      )}
                    >
                      {txn.movement_type === "debito"
                        ? <TrendingDown className="h-3.5 w-3.5" />
                        : <TrendingUp className="h-3.5 w-3.5" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{txn.detail}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{txn.date ?? "—"}</span>
                        {txn.budget_category && (
                          <Badge variant="outline" className="text-xs py-0 px-1.5">
                            {CATEGORY_LABELS[txn.budget_category] ?? txn.budget_category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        txn.movement_type === "debito" ? "text-destructive" : "text-green-600"
                      )}
                    >
                      {txn.movement_type === "debito" ? "-" : "+"}{formatCurrency(txn.amount)}
                    </span>
                    <button
                      onClick={() => handleDelete(txn.transaction_id)}
                      disabled={deletingId === txn.transaction_id}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      {deletingId === txn.transaction_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
