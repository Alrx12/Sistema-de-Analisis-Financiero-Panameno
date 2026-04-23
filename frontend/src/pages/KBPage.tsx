import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Brain, Search, Trash2, AlertTriangle, CheckCircle2, Globe, BookOpen, Zap, Lock } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { listKB, listGlobalKB, deleteKBEntry, previewCanonical } from "@/api/kb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { capitalize } from "@/lib/utils"
import { toast } from "@/components/ui/toast"
import { useAuthStore } from "@/stores/authStore"
import type { KBEntry } from "@/types"

// ─── Paleta de colores ────────────────────────────────────────────────────────

const ETYPE_COLOR: Record<string, string> = {
  gasto:                "bg-red-100 text-red-700",
  ingreso:              "bg-green-100 text-green-700",
  cargo_financiero:     "bg-yellow-100 text-yellow-700",
  transferencia_propia: "bg-slate-100 text-slate-600",
  transferencia_tercero:"bg-indigo-100 text-indigo-700",
  reembolso:            "bg-cyan-100 text-cyan-700",
}

const ROLE_COLOR: Record<string, string> = {
  presupuestable:    "bg-blue-100 text-blue-700",
  no_presupuestable: "bg-orange-100 text-orange-700",
  gasto_operativo:   "bg-violet-100 text-violet-700",
  gasto_financiero:  "bg-yellow-100 text-yellow-700",
  solo_balance:      "bg-slate-100 text-slate-600",
  ahorro_inversion:  "bg-emerald-100 text-emerald-700",
  revisar:           "bg-rose-100 text-rose-700",
}

function Chip({ label, colorMap }: { label: string | null; colorMap: Record<string, string> }) {
  if (!label) return <span className="text-xs text-muted-foreground">—</span>
  const cls = colorMap[label] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {capitalize(label.replace(/_/g, " "))}
    </span>
  )
}

// ─── Preview de clave canónica ────────────────────────────────────────────────

function PreviewTool() {
  const [input, setInput] = useState("")
  const [submitted, setSubmitted] = useState("")

  const { data, isFetching, isError } = useQuery({
    queryKey: ["kb-preview", submitted],
    queryFn: () => previewCanonical(submitted),
    enabled: !!submitted,
  })

  function handlePreview() {
    if (input.trim()) setSubmitted(input.trim())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-yellow-500" />
          Previsualizar clave canónica
        </CardTitle>
        <CardDescription>
          Ingresa un descriptor raw del banco para ver cómo lo normaliza el sistema antes de guardarlo en el KB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="ej: TRESCUATES-4187-94XX-XXXX-6798"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePreview()}
          />
          <Button onClick={handlePreview} disabled={!input.trim() || isFetching} size="sm">
            {isFetching ? "…" : "Previsualizar"}
          </Button>
        </div>
        {isError && <p className="text-sm text-destructive">Error al previsualizar.</p>}
        {data && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">Raw:</span>
              <code className="bg-background border rounded px-1.5 py-0.5 text-xs">{data.original}</code>
              <span className="text-muted-foreground text-xs">→</span>
              <span className="text-muted-foreground text-xs">Clave canónica:</span>
              <code className="font-semibold bg-background border rounded px-2 py-0.5 text-sm">{data.canonical_key}</code>
            </div>
            {data.is_ambiguous ? (
              <div className="flex items-center gap-1.5 text-xs text-yellow-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Clave ambigua — demasiado genérica para el KB (ej: PAGO, TRANSFERENCIA).
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Clave válida. Así se guardaría en el KB.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Fila de entrada — rediseñada como card compacta ─────────────────────────

function EntryRow({
  entry,
  onDelete,
  readOnly = false,
}: {
  entry: KBEntry
  onDelete?: (key: string) => void
  readOnly?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    onDelete?.(entry.key)
    setConfirming(false)
  }

  return (
    <div className="rounded-lg border bg-card px-4 py-3 hover:bg-accent/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Clave + chips en una sola línea que puede wrap */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold leading-tight break-words">{entry.key}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip label={entry.economic_type} colorMap={ETYPE_COLOR} />
            {entry.budget_category && (
              <span className="text-xs text-muted-foreground">
                · {capitalize(entry.budget_category)}
              </span>
            )}
            {entry.budget_role && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <Chip label={entry.budget_role} colorMap={ROLE_COLOR} />
              </>
            )}
          </div>
        </div>

        {/* Botón eliminar — solo en KB personal */}
        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0">
            {confirming && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
                onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            )}
            <Button
              variant={confirming ? "destructive" : "ghost"}
              size="sm"
              className={`h-7 w-7 p-0 ${confirming ? "" : "text-muted-foreground hover:text-destructive"}`}
              onClick={handleDelete}
              title={confirming ? "Confirmar eliminación" : "Eliminar entrada"}
            >
              {confirming ? <span className="text-xs px-1">OK</span> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Lista filtrable de entradas ──────────────────────────────────────────────

function EntryList({
  entries,
  onDelete,
  readOnly = false,
  emptyPersonal = false,
}: {
  entries: KBEntry[]
  onDelete?: (key: string) => void
  readOnly?: boolean
  emptyPersonal?: boolean
}) {
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")

  const etypes = useMemo(() => {
    const seen = new Set<string>()
    entries.forEach(e => { if (e.economic_type) seen.add(e.economic_type) })
    return Array.from(seen).sort()
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchSearch = !search ||
        e.key.toLowerCase().includes(search.toLowerCase()) ||
        (e.budget_category ?? "").toLowerCase().includes(search.toLowerCase())
      const matchType = filterType === "all" || e.economic_type === filterType
      return matchSearch && matchType
    })
  }, [entries, search, filterType])

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por merchant o categoría…"
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          {etypes.map(t => (
            <option key={t} value={t}>{capitalize(t.replace(/_/g, " "))}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {entries.length} entradas{search || filterType !== "all" ? " · filtradas" : ""}
      </p>

      {/* Filas */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground/40" />
            {emptyPersonal && entries.length === 0 ? (
              <>
                <p className="text-sm font-medium">El KB personal está vacío</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Cuando corrijas una transacción con "Reclasificar", el sistema aprende y guarda la corrección aquí.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No hay entradas que coincidan.</p>
            )}
          </div>
        ) : (
          filtered.map(entry => (
            <EntryRow
              key={entry.key}
              entry={entry}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Tab = "personal" | "global"

export default function KBPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>("personal")
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  // Only admins can view the Knowledge Base
  useEffect(() => {
    if (user !== undefined && user?.is_admin !== true) {
      navigate("/", { replace: true })
    }
  }, [user, navigate])

  if (user?.is_admin !== true) return null

  const { data: personal, isLoading: loadingPersonal, isError: errorPersonal } = useQuery({
    queryKey: ["kb"],
    queryFn: listKB,
  })

  const { data: global, isLoading: loadingGlobal, isError: errorGlobal } = useQuery({
    queryKey: ["kb-global"],
    queryFn: listGlobalKB,
    enabled: activeTab === "global",  // solo carga cuando abre el tab
  })

  const deleteMutation = useMutation({
    mutationFn: deleteKBEntry,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["kb"] })
      const msg = res.patterns_removed > 0
        ? `"${res.key}" eliminado (+ ${res.patterns_removed} patrón)`
        : `"${res.key}" eliminado`
      toast(msg, "success")
    },
    onError: () => toast("No se pudo eliminar la entrada", "error"),
  })

  if (loadingPersonal) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
  if (errorPersonal) return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      Error cargando el Knowledge Base.
    </div>
  )

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Knowledge Base</h1>
          <p className="page-subtitle">Lo que el sistema ha aprendido de tus correcciones</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Brain className="h-4 w-4" />} iconClass="kpi-icon-purple"
          label="Entradas personales" value={personal?.entries.length ?? 0}
          sub="exact matches aprendidos" />
        <StatCard icon={<Zap className="h-4 w-4" />} iconClass="kpi-icon-orange"
          label="Patrones personales" value={personal?.patterns_count ?? 0}
          sub="reglas regex activas" />
        <StatCard icon={<BookOpen className="h-4 w-4" />} iconClass="kpi-icon-blue"
          label="Correcciones totales" value={personal?.corrections_count ?? 0}
          sub="veces que entrenaste el sistema" />
        <StatCard icon={<Globe className="h-4 w-4" />} iconClass="kpi-icon-green"
          label="KB global" value={personal?.global_exact_matches_count ?? 0}
          sub={`+ ${personal?.global_patterns_count ?? 0} patrones compartidos`} />
      </div>

      {/* Preview tool */}
      <PreviewTool />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b">
          <TabButton active={activeTab === "personal"} onClick={() => setActiveTab("personal")}
            icon={<Brain className="h-3.5 w-3.5" />}
            label={`Personal (${personal?.entries.length ?? 0})`} />
          <TabButton active={activeTab === "global"} onClick={() => setActiveTab("global")}
            icon={<Lock className="h-3.5 w-3.5" />}
            label={`Global (${personal?.global_exact_matches_count ?? 0})`} />
        </div>

        {activeTab === "personal" && (
          <EntryList
            entries={personal?.entries ?? []}
            onDelete={(key) => deleteMutation.mutate(key)}
            emptyPersonal
          />
        )}

        {activeTab === "global" && (
          <>
            {loadingGlobal ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : errorGlobal ? (
              <p className="text-sm text-destructive py-8 text-center">Error cargando el KB global.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                  <Lock className="h-4 w-4 text-blue-600 shrink-0" />
                  <p className="text-sm text-blue-700">
                    El KB global es compartido y de solo lectura. Contiene {personal?.global_patterns_count ?? 0} patrones regex adicionales no listados aquí.
                  </p>
                </div>
                <EntryList
                  entries={global?.entries ?? []}
                  readOnly
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {icon}{label}
    </button>
  )
}

function StatCard({ icon, iconClass, label, value, sub }: {
  icon: React.ReactNode; iconClass?: string; label: string; value: number; sub: string
}) {
  return (
    <Card className="zoho-card border-0">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
          <div className={iconClass ?? "kpi-icon-blue"}>{icon}</div>
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
