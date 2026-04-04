import { useState, useEffect, useCallback } from "react"
import { Brain, CheckCircle2, ChevronRight, Loader2, SkipForward, Sparkles } from "lucide-react"
import { getReviewGroups, applyReviewGroup } from "@/api/transactions"
import type { ReviewGroup } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/components/ui/toast"
import { BUDGET_CATEGORIES } from "@/lib/categories"
import ProGate from "@/components/ProGate"

const ROLES: { value: string; label: string }[] = [
  { value: "presupuestable",    label: "Presupuestable" },
  { value: "no_presupuestable", label: "No presupuestable" },
  { value: "gasto_operativo",   label: "Gasto operativo" },
  { value: "gasto_financiero",  label: "Gasto financiero" },
  { value: "ahorro_inversion",  label: "Ahorro / Inversión" },
]

const SUBTYPES: { value: string; label: string }[] = [
  { value: "extraordinario", label: "Extraordinario" },
  { value: "recurrente",     label: "Recurrente" },
  { value: "variable",       label: "Variable" },
  { value: "financiero",     label: "Financiero" },
]

function inferEtypeDetail(cat: string, subtype: string): string {
  if (cat === "cargo_financiero" || cat === "deuda") return "cargo_bancario"
  if (subtype === "recurrente") return "gasto_recurrente"
  return "gasto_variable"
}

function defaultRole(cat: string): string {
  if (["cargo_financiero", "deuda"].includes(cat)) return "gasto_financiero"
  if (["ahorro", "inversion"].includes(cat))        return "ahorro_inversion"
  if (["alquiler", "hipoteca", "supermercado", "alimentacion", "servicios",
       "agua", "luz", "internet", "telefono", "salud", "educacion"].includes(cat)) return "presupuestable"
  if (["transporte", "gasolina"].includes(cat))     return "gasto_operativo"
  return "no_presupuestable"
}

// ─── Fila de grupo ────────────────────────────────────────────────────────────

interface GroupRowProps {
  group: ReviewGroup
  onApplied: (key: string) => void
  onSkipped: (key: string) => void
}

function GroupRow({ group, onApplied, onSkipped }: GroupRowProps) {
  const [category, setCategory]   = useState(group.current_category ?? "")
  const [role, setRole]           = useState(group.current_budget_role && group.current_budget_role !== "revisar" ? group.current_budget_role : "")
  const [subtype, setSubtype]     = useState("extraordinario")
  const [loading, setLoading]     = useState(false)

  // Auto-inferir role cuando cambia category
  function handleCategoryChange(val: string) {
    setCategory(val)
    setRole(defaultRole(val))
  }

  async function handleApply() {
    if (!category || !role) return
    setLoading(true)
    try {
      const res = await applyReviewGroup({
        canonical_key: group.canonical_key,
        transaction_ids: group.transaction_ids,
        sample_detail: group.sample_detail,
        economic_type: "gasto",
        economic_type_detail: inferEtypeDetail(category, subtype),
        subtype_economic: subtype,
        budget_category: category,
        budget_role: role,
        also_learn: true,
        force_personal: false,
        weight: 2.0,
      })
      toast(
        `${res.updated_count} transacciones actualizadas · KB ${res.kb_target ?? "personal"}`,
        "success"
      )
      onApplied(group.canonical_key)
    } catch {
      toast("Error al aplicar la clasificación", "error")
      setLoading(false)
    }
  }

  const canApply = category !== "" && role !== ""

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      {/* Merchant */}
      <td className="py-3 pl-4 pr-2">
        <div className="font-medium text-sm">{group.canonical_key}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={group.sample_detail}>
          {group.sample_detail}
        </div>
      </td>

      {/* Count + amount */}
      <td className="py-3 px-2 text-center">
        <Badge variant="secondary" className="tabular-nums">
          {group.count}
        </Badge>
        <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(group.total_amount)}</div>
      </td>

      {/* Categoría */}
      <td className="py-3 px-2">
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          <option value="">— Categoría —</option>
          {BUDGET_CATEGORIES.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ")}</option>
          ))}
        </select>
      </td>

      {/* Frecuencia */}
      <td className="py-3 px-2">
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          value={subtype}
          onChange={(e) => setSubtype(e.target.value)}
        >
          {SUBTYPES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </td>

      {/* Rol */}
      <td className="py-3 px-2">
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">— Rol —</option>
          {ROLES.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </td>

      {/* Acciones */}
      <td className="py-3 pl-2 pr-4">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={!canApply || loading}
            onClick={handleApply}
            className="h-7 px-2.5 text-xs gap-1"
          >
            {loading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <ChevronRight className="h-3 w-3" />}
            Aplicar
          </Button>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Omitir este grupo"
            onClick={() => onSkipped(group.canonical_key)}
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RetrainPage() {
  const [groups, setGroups]         = useState<ReviewGroup[]>([])
  const [loading, setLoading]       = useState(true)
  const [appliedCount, setAppliedCount] = useState(0)
  const [totalTx, setTotalTx]       = useState(0)

  useEffect(() => {
    getReviewGroups()
      .then(data => {
        setGroups(data)
        setTotalTx(data.reduce((s, g) => s + g.count, 0))
      })
      .finally(() => setLoading(false))
  }, [])

  const handleApplied = useCallback((key: string) => {
    setGroups(prev => {
      const removed = prev.find(g => g.canonical_key === key)
      if (removed) setAppliedCount(c => c + removed.count)
      return prev.filter(g => g.canonical_key !== key)
    })
  }, [])

  const handleSkipped = useCallback((key: string) => {
    setGroups(prev => prev.filter(g => g.canonical_key !== key))
  }, [])

  const resolvedPct = totalTx > 0 ? Math.round((appliedCount / totalTx) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando grupos…
      </div>
    )
  }

  return (
    <ProGate
      feature="Entrenamiento masivo"
      description="Revisa y corrige grupos de transacciones de un mismo comercio en bloque. El sistema aprende de todas tus correcciones y mejora su precisión con el tiempo."
    >
    <div className="mx-auto max-w-5xl space-y-5">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Entrenamiento masivo
          </h1>
          <p className="page-subtitle">
            Clasifica grupos de transacciones de una sola vez. Cada corrección entrena el KB.
          </p>
        </div>
        {appliedCount > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold text-emerald-600">
              {appliedCount} transacciones resueltas ({resolvedPct}%)
            </p>
            <div className="mt-1.5 h-1.5 w-32 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${resolvedPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty state: todo resuelto */}
      {groups.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-8 pb-10 text-center space-y-3">
            {appliedCount > 0
              ? <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              : <Sparkles className="h-10 w-10 text-muted-foreground mx-auto" />}
            <p className="font-medium">
              {appliedCount > 0
                ? `¡Listo! Resolviste ${appliedCount} transacciones`
                : "No hay transacciones pendientes de revisión"}
            </p>
            <p className="text-sm text-muted-foreground">
              {appliedCount > 0
                ? "El KB fue actualizado. La próxima vez que subas un estado de cuenta, estos merchants se clasificarán automáticamente."
                : "Todas tus transacciones tienen alta confianza o ya fueron reclasificadas."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabla de grupos */}
      {groups.length > 0 && (
        <Card className="zoho-card border-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  {groups.length} grupos · {groups.reduce((s, g) => s + g.count, 0)} transacciones pendientes
                </CardTitle>
                <CardDescription>
                  Ordenados por frecuencia — corrige los primeros y cubre la mayoría del volumen
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="zoho-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th className="text-center">Txs</th>
                    <th className="w-44">Categoría</th>
                    <th className="w-32">Frecuencia</th>
                    <th className="w-40">Rol presupuesto</th>
                    <th className="w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <GroupRow
                      key={g.canonical_key}
                      group={g}
                      onApplied={handleApplied}
                      onSkipped={handleSkipped}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </ProGate>
  )
}
