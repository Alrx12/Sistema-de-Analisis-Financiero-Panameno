import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from "recharts"
import {
  Users,
  Upload,
  BarChart2,
  ShieldAlert,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Crown,
  RefreshCw,
  Lock,
  Download,
  RotateCcw,
  Trash2,
  FileX,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  Mail,
  Send,
  Eye,
  Users2,
} from "lucide-react"
import { useState } from "react"
import { getAnalytics } from "@/api/analytics"
import {
  getAdminJobs,
  retryFailedJob,
  discardFailedFile,
  getFailedFileDownloadUrl,
  getAdminUsers,
  suspendUser,
  unsuspendUser,
  patchUserPlan,
  deleteAdminUser,
  getEmailSegments,
  sendEmailBroadcast,
  type AdminFailedJob,
  type AdminUserItem,
} from "@/api/admin"
import { useAuthStore } from "@/stores/authStore"
import { toast } from "@/components/ui/toast"

// ── Paleta ────────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  friends_and_family: "#6366f1",
  pro: "#f59e0b",
  free: "#94a3b8",
}
const PLAN_LABELS: Record<string, string> = {
  friends_and_family: "F&F Beta",
  pro: "Pro",
  free: "Gratis",
}
const METHOD_COLORS: Record<string, string> = {
  kb_personal_exact:   "#10b981",
  kb_personal_pattern: "#34d399",
  kb_global_exact:     "#6366f1",
  kb_global_pattern:   "#818cf8",
  "builtin:salario":   "#f59e0b",
  fallback:            "#f87171",
}
const BANK_COLORS = ["#1a3a8f", "#e31837", "#00843d", "#e85d04", "#94a3b8"]

const MONTH_ABBREV: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-")
  return `${MONTH_ABBREV[m] ?? m} ${y.slice(2)}`
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon,
  color = "blue",
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color?: "blue" | "orange" | "green" | "red" | "purple"
}) {
  return (
    <div className="zoho-card p-4 flex items-start gap-3">
      <div className={`kpi-icon-${color} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-3xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold text-base uppercase tracking-wide text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Plan badge ────────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    pro: "bg-amber-50 text-amber-700 border-amber-200",
    friends_and_family: "bg-indigo-50 text-indigo-700 border-indigo-200",
    free: "bg-slate-50 text-slate-600 border-slate-200",
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${styles[plan] ?? styles.free}`}>
      {PLAN_LABELS[plan] ?? plan}
    </span>
  )
}

// ── User manager ──────────────────────────────────────────────────────────────
function UserManager() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")
  // track which user's plan select is open / pending
  const [pendingPlan, setPendingPlan] = useState<Record<string, string>>({})

  const PAGE_SIZE = 50

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users", page],
    queryFn: () => getAdminUsers(page, PAGE_SIZE),
    staleTime: 1000 * 60, // 1 min
  })

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendUser(userId),
    onSuccess: (_, userId) => {
      toast("Usuario suspendido", "success")
      qc.invalidateQueries({ queryKey: ["admin-users", page] })
      // also update overview
      qc.invalidateQueries({ queryKey: ["admin-analytics"] })
    },
    onError: () => toast("No se pudo suspender el usuario", "error"),
  })

  const unsuspendMutation = useMutation({
    mutationFn: (userId: string) => unsuspendUser(userId),
    onSuccess: () => {
      toast("Usuario reactivado", "success")
      qc.invalidateQueries({ queryKey: ["admin-users", page] })
      qc.invalidateQueries({ queryKey: ["admin-analytics"] })
    },
    onError: () => toast("No se pudo reactivar el usuario", "error"),
  })

  const planMutation = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: string }) =>
      patchUserPlan(userId, plan),
    onSuccess: (res) => {
      toast(`Plan actualizado: ${res.plan}`, "success")
      setPendingPlan((prev) => {
        const next = { ...prev }
        delete next[res.user_id]
        return next
      })
      qc.invalidateQueries({ queryKey: ["admin-users", page] })
      qc.invalidateQueries({ queryKey: ["admin-analytics"] })
    },
    onError: (_err, vars) => {
      toast("No se pudo cambiar el plan", "error")
      setPendingPlan((prev) => {
        const next = { ...prev }
        delete next[vars.userId]
        return next
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteAdminUser(userId),
    onSuccess: () => {
      toast("Usuario eliminado", "success")
      qc.invalidateQueries({ queryKey: ["admin-users", page] })
      qc.invalidateQueries({ queryKey: ["admin-analytics"] })
    },
    onError: () => toast("No se pudo eliminar el usuario", "error"),
  })

  // Client-side filter (name/email search + plan filter) on current page
  const allItems: AdminUserItem[] = data?.items ?? []
  const filtered = allItems.filter((u) => {
    const matchSearch =
      search.trim() === "" ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())
    const matchPlan = planFilter === "all" || u.plan === planFilter
    return matchSearch && matchPlan
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  function handlePlanChange(userId: string, newPlan: string) {
    setPendingPlan((prev) => ({ ...prev, [userId]: newPlan }))
    planMutation.mutate({ userId, plan: newPlan })
  }

  function handleDelete(user: AdminUserItem) {
    if (
      !confirm(
        `¿Eliminar permanentemente a ${user.email}?\n\nEsto borrará TODOS sus análisis, transacciones, KB personal y archivos subidos. IRREVERSIBLE.`
      )
    )
      return
    deleteMutation.mutate(user.user_id)
  }

  return (
    <Section title="Gestión de usuarios" icon={<Users className="h-4 w-4" />}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por email o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: "#111827", background: "#ffffff" }}
            className="w-full rounded border border-border pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Plan filter */}
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          style={{ color: "#111827", background: "#ffffff" }}
          className="rounded border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">Todos los planes</option>
          <option value="free">Gratis</option>
          <option value="pro">Pro</option>
          <option value="friends_and_family">F&amp;F Beta</option>
        </select>

        <span className="ml-auto text-xs text-muted-foreground">
          {data ? `${data.total} usuarios en total` : ""}
        </span>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {isLoading ? (
        <div className="zoho-card p-6 text-center text-xs text-muted-foreground">Cargando usuarios…</div>
      ) : filtered.length === 0 ? (
        <div className="zoho-card p-6 text-center text-xs text-muted-foreground">
          {search || planFilter !== "all" ? "Sin resultados para ese filtro." : "Sin usuarios registrados."}
        </div>
      ) : (
        <div className="zoho-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="zoho-table w-full text-xs">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Registro</th>
                  <th>Usuario</th>
                  <th className="text-center">Plan</th>
                  <th className="text-center">Estado</th>
                  <th className="text-center">Uploads</th>
                  <th className="text-center">Cambiar plan</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isSuspending =
                    suspendMutation.isPending && suspendMutation.variables === user.user_id
                  const isUnsuspending =
                    unsuspendMutation.isPending && unsuspendMutation.variables === user.user_id
                  const isDeleting =
                    deleteMutation.isPending && deleteMutation.variables === user.user_id
                  const isPlanPending = planMutation.isPending && pendingPlan[user.user_id] !== undefined
                  const displayPlan = pendingPlan[user.user_id] ?? user.plan

                  return (
                    <tr key={user.user_id} className={user.is_suspended ? "opacity-60" : ""}>
                      {/* Fecha registro */}
                      <td className="whitespace-nowrap text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("es-PA", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Usuario */}
                      <td>
                        <div className="max-w-[200px]">
                          <p className="truncate font-medium">
                            {user.full_name || <span className="text-muted-foreground italic">Sin nombre</span>}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {user.is_admin && (
                              <span className="text-[9px] bg-red-50 text-red-600 border border-red-200 rounded px-1 font-bold">ADMIN</span>
                            )}
                            {!user.is_verified && (
                              <span className="text-[9px] bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1">no verificado</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Plan badge */}
                      <td className="text-center">
                        <PlanBadge plan={displayPlan} />
                      </td>

                      {/* Estado */}
                      <td className="text-center">
                        {user.is_suspended ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                            <UserX className="h-3 w-3" />
                            Suspendido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                            <UserCheck className="h-3 w-3" />
                            Activo
                          </span>
                        )}
                      </td>

                      {/* Uploads */}
                      <td className="text-center font-mono font-semibold">{user.upload_count}</td>

                      {/* Cambiar plan */}
                      <td className="text-center">
                        {user.is_admin ? (
                          <span className="text-[10px] text-muted-foreground italic">—</span>
                        ) : (
                          <select
                            value={displayPlan}
                            disabled={isPlanPending}
                            onChange={(e) => handlePlanChange(user.user_id, e.target.value)}
                            style={{ color: "#111827", background: "#ffffff" }}
                            className="rounded border border-border px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          >
                            <option value="free">Gratis</option>
                            <option value="pro">Pro</option>
                            <option value="friends_and_family">F&amp;F Beta</option>
                          </select>
                        )}
                      </td>

                      {/* Acciones */}
                      <td>
                        <div className="flex items-center gap-1 justify-center">
                          {/* Suspender / Reactivar — no aplica a admins */}
                          {!user.is_admin && (
                            user.is_suspended ? (
                              <button
                                onClick={() => unsuspendMutation.mutate(user.user_id)}
                                disabled={isUnsuspending || isSuspending}
                                title="Reactivar usuario"
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                              >
                                <UserCheck className={`h-3 w-3 ${isUnsuspending ? "animate-pulse" : ""}`} />
                                {isUnsuspending ? "…" : "Reactivar"}
                              </button>
                            ) : (
                              <button
                                onClick={() => suspendMutation.mutate(user.user_id)}
                                disabled={isSuspending || isUnsuspending}
                                title="Suspender usuario (bloquea acceso)"
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 transition-colors disabled:opacity-50"
                              >
                                <UserX className={`h-3 w-3 ${isSuspending ? "animate-pulse" : ""}`} />
                                {isSuspending ? "…" : "Suspender"}
                              </button>
                            )
                          )}

                          {/* Eliminar — no aplica a admins */}
                          {!user.is_admin && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={isDeleting}
                              title="Eliminar usuario y todos sus datos"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className={`h-3 w-3 ${isDeleting ? "animate-pulse" : ""}`} />
                              {isDeleting ? "…" : "Eliminar"}
                            </button>
                          )}

                          {user.is_admin && (
                            <span className="text-[10px] text-muted-foreground italic">protegido</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  className="p-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isFetching}
                  className="p-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ── Failed jobs manager ───────────────────────────────────────────────────────
function FailedJobsManager() {
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-failed-jobs"],
    queryFn: () => getAdminJobs("error", 100),
    staleTime: 1000 * 30, // 30 s — más fresco que el dashboard general
  })

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => retryFailedJob(jobId),
    onSuccess: (res) => {
      toast(`Re-procesamiento iniciado. Nuevo job: ${res.new_job_id.slice(0, 8)}…`, "success")
      qc.invalidateQueries({ queryKey: ["admin-failed-jobs"] })
    },
    onError: () => toast("No se pudo iniciar el re-procesamiento", "error"),
  })

  const discardMutation = useMutation({
    mutationFn: (jobId: string) => discardFailedFile(jobId),
    onSuccess: () => {
      toast("Archivo fallido descartado", "success")
      qc.invalidateQueries({ queryKey: ["admin-failed-jobs"] })
    },
    onError: () => toast("No se pudo descartar el archivo", "error"),
  })

  const jobs: AdminFailedJob[] = data?.jobs ?? []

  return (
    <Section title="Jobs fallidos — gestión" icon={<ShieldAlert className="h-4 w-4" />}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">
          {data ? `${data.count} job${data.count !== 1 ? "s" : ""} con error` : "Cargando…"}
          {" · "}
          Archivos preservados en <code className="bg-muted px-1 rounded text-[10px]">storage/failed/</code>
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {isLoading ? (
        <div className="zoho-card p-6 text-center text-xs text-muted-foreground">Cargando jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="zoho-card p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-700">Sin jobs fallidos</p>
          <p className="text-xs text-muted-foreground mt-1">Todo el procesamiento está operando correctamente.</p>
        </div>
      ) : (
        <div className="zoho-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="zoho-table w-full text-xs">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Fecha</th>
                  <th>Usuario</th>
                  <th>Archivo</th>
                  <th>Error</th>
                  <th className="text-center">Archivo</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isPending =
                    retryMutation.isPending && retryMutation.variables === job.job_id
                  const isDiscarding =
                    discardMutation.isPending && discardMutation.variables === job.job_id

                  return (
                    <tr key={job.job_id}>
                      {/* Fecha */}
                      <td className="whitespace-nowrap text-muted-foreground">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString("es-PA", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>

                      {/* Usuario */}
                      <td>
                        <div className="max-w-[160px]">
                          <p className="truncate font-medium">{job.user_email}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {job.user_id.slice(0, 8)}…
                          </p>
                        </div>
                      </td>

                      {/* Archivo */}
                      <td className="max-w-[140px] truncate text-muted-foreground">
                        {job.original_filename ?? "—"}
                      </td>

                      {/* Error */}
                      <td>
                        <p
                          className="max-w-[220px] truncate text-red-600"
                          title={job.error_message ?? ""}
                        >
                          {job.error_message ?? "Sin mensaje"}
                        </p>
                      </td>

                      {/* Archivo guardado */}
                      <td className="text-center">
                        {job.failed_file_exists ? (
                          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            ✓ guardado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[10px]">
                            <FileX className="h-3 w-3" />
                            n/a
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td>
                        <div className="flex items-center gap-1 justify-center">
                          {/* Descargar */}
                          {job.failed_file_exists && (
                            <a
                              href={getFailedFileDownloadUrl(job.job_id)}
                              download={job.original_filename ?? true}
                              title="Descargar archivo para diagnóstico"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              <Download className="h-3 w-3" />
                              Descargar
                            </a>
                          )}

                          {/* Re-procesar */}
                          {job.failed_file_exists && (
                            <button
                              onClick={() => retryMutation.mutate(job.job_id)}
                              disabled={isPending || isDiscarding}
                              title="Re-encolar este archivo en Celery"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
                              {isPending ? "…" : "Re-procesar"}
                            </button>
                          )}

                          {/* Descartar */}
                          {job.failed_file_exists && (
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar el archivo guardado de ${job.user_email}?\nEsto no se puede deshacer.`)) {
                                  discardMutation.mutate(job.job_id)
                                }
                              }}
                              disabled={isPending || isDiscarding}
                              title="Eliminar archivo fallido sin re-procesar"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className={`h-3 w-3 ${isDiscarding ? "animate-pulse" : ""}`} />
                              {isDiscarding ? "…" : "Descartar"}
                            </button>
                          )}

                          {/* Sin archivo — solo histórico */}
                          {!job.failed_file_exists && (
                            <span className="text-[10px] text-muted-foreground italic">
                              solo historial
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── EmailComposer ─────────────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { value: "all",               label: "Todos los usuarios activos" },
  { value: "unverified",        label: "Sin verificar (email/password)" },
  { value: "no_onboarding",     label: "Sin onboarding completado" },
  { value: "active",            label: "Verificados con onboarding completo" },
  { value: "free",              label: "Plan Free" },
  { value: "pro",               label: "Plan Pro" },
  { value: "friends_and_family",label: "Plan Friends & Family" },
  { value: "specific",          label: "Email específico" },
]

function EmailComposer() {
  const [segment, setSegment]             = useState("all")
  const [specificEmail, setSpecificEmail] = useState("")
  const [subject, setSubject]             = useState("")
  const [bodyHtml, setBodyHtml]           = useState("")
  const [preview, setPreview]             = useState<string | null>(null)
  const [showConfirm, setShowConfirm]     = useState(false)
  const [result, setResult]               = useState<{ sent: number; failed: number; total: number } | null>(null)

  const { data: segments } = useQuery({
    queryKey: ["adminEmailSegments"],
    queryFn: getEmailSegments,
    staleTime: 60_000,
  })

  const sendMutation = useMutation({
    mutationFn: () =>
      sendEmailBroadcast({
        subject,
        body_html: bodyHtml,
        segment,
        specific_email: segment === "specific" ? specificEmail : undefined,
      }),
    onSuccess: (data) => {
      setResult(data)
      setShowConfirm(false)
      toast(`✅ ${data.sent} emails enviados correctamente`, "success")
    },
    onError: (err: any) => {
      setShowConfirm(false)
      toast(err?.response?.data?.detail || "Error al enviar emails", "error")
    },
  })

  const recipientCount =
    segment === "specific"
      ? (specificEmail ? 1 : 0)
      : (segments?.[segment]?.count ?? "…")

  const canSend = subject.trim().length > 0 && bodyHtml.trim().length > 0 &&
    (segment !== "specific" || specificEmail.trim().length > 0)

  // Preview: wrap body in SAFPRO template (client-side lightweight version)
  function handlePreview() {
    const paragraphs = bodyHtml.includes("<p")
      ? bodyHtml
      : bodyHtml.split("\n").filter(l => l.trim()).map(l =>
          `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${l}</p>`
        ).join("\n")

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:sans-serif;">
<div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#1c2b4b;padding:24px 40px;text-align:center;">
    <span style="font-size:20px;font-weight:700;color:#fff;">SAFPRO</span>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:18px;font-weight:600;color:#1c2b4b;margin:0 0 20px;">Hola, [Nombre] 👋</p>
    ${paragraphs}
    <div style="text-align:center;margin-top:24px;">
      <a href="https://safpro.us" style="background:#e05c19;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;">Ir a SAFPRO →</a>
    </div>
  </div>
  <div style="background:#f4f5f7;padding:16px 40px;text-align:center;font-size:12px;color:#9ca3af;">
    SAFPRO · Términos · Privacidad
  </div>
</div>
</body></html>`
    setPreview(html)
  }

  return (
    <Section icon={<Mail size={18} />} title="Emails — Comunicaciones">
      <div className="space-y-5">

        {/* Resultado previo */}
        {result && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 size={16} className="text-green-600 shrink-0" />
            <span className="text-sm text-green-800">
              Último envío: <strong>{result.sent}</strong> enviados,{" "}
              <strong>{result.failed}</strong> fallidos de <strong>{result.total}</strong> destinatarios.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Segmento */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              Destinatarios
            </label>
            <select
              value={segment}
              onChange={e => { setSegment(e.target.value); setResult(null) }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              {SEGMENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {segment !== "specific" && segments && (
              <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                <Users2 size={11} />
                {segments[segment]?.count ?? "…"} usuarios en este segmento
              </p>
            )}
          </div>

          {/* Email específico */}
          {segment === "specific" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                placeholder="usuario@ejemplo.com"
                value={specificEmail}
                onChange={e => setSpecificEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          )}
        </div>

        {/* Asunto */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
            Asunto
          </label>
          <input
            type="text"
            placeholder="Ej: Novedades en SAFPRO — y algo que viene pronto 🚀"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        {/* Cuerpo */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
            Cuerpo del email
            <span className="ml-2 text-slate-400 normal-case font-normal">(texto plano o HTML básico)</span>
          </label>
          <textarea
            rows={10}
            placeholder={"Puedes escribir párrafos separados por línea en blanco.\n\nO usar <p>, <strong>, <br> y links.\n\nEl encabezado y pie de SAFPRO se agregan automáticamente."}
            value={bodyHtml}
            onChange={e => setBodyHtml(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 resize-y"
          />
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePreview}
            disabled={!bodyHtml.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
          >
            <Eye size={14} /> Vista previa
          </button>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSend || sendMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40 transition"
          >
            <Send size={14} />
            {sendMutation.isPending
              ? "Enviando…"
              : `Enviar a ${recipientCount} usuario${recipientCount === 1 ? "" : "s"}`}
          </button>
        </div>

        {/* Confirmación */}
        {showConfirm && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} />
              ¿Confirmar envío?
            </p>
            <p className="text-sm text-amber-700">
              Se enviará <strong>"{subject}"</strong> a{" "}
              <strong>{recipientCount} usuario{recipientCount === 1 ? "" : "s"}</strong>.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition"
              >
                {sendMutation.isPending ? "Enviando…" : "Sí, enviar"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Modal de preview */}
        {preview && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setPreview(null)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <span className="text-sm font-semibold text-slate-700">Vista previa del email</span>
                <button
                  onClick={() => setPreview(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >✕</button>
              </div>
              <iframe
                srcDoc={preview}
                className="flex-1 w-full rounded-b-xl"
                style={{ minHeight: 500 }}
                title="preview"
              />
            </div>
          </div>
        )}

      </div>
    </Section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user)

  // Guard — si no es admin, mostrar acceso denegado sin llamar al API
  if (!user?.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <Lock className="h-8 w-8 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-lg">Acceso restringido</p>
          <p className="text-sm text-muted-foreground">Esta página es solo para administradores de SAFPRO.</p>
        </div>
      </div>
    )
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: getAnalytics,
    staleTime: 1000 * 60 * 5, // 5 min cache
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando métricas…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-muted-foreground">Error al cargar las métricas. Verifica que el servidor esté corriendo.</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-primary underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const { overview, retention, quality, trends, top_banks } = data

  // Datos para charts
  const planData = Object.entries(overview.users_by_plan).map(([plan, count]) => ({
    name: PLAN_LABELS[plan] ?? plan,
    value: count,
    color: PLAN_COLORS[plan] ?? "#94a3b8",
  }))

  const methodData = Object.entries(quality.transactions_by_method)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([method, count]) => ({
      method: method.replace("builtin:", "").replace("kb_", "").replace("_", " "),
      count,
      color: METHOD_COLORS[method] ?? "#94a3b8",
    }))

  // Merge trends por mes
  const monthSet = new Set([
    ...trends.users_by_month.map((d) => d.month),
    ...trends.uploads_by_month.map((d) => d.month),
  ])
  const trendData = Array.from(monthSet)
    .sort()
    .map((month) => ({
      month: fmtMonth(month),
      usuarios: trends.users_by_month.find((d) => d.month === month)?.count ?? 0,
      uploads: trends.uploads_by_month.find((d) => d.month === month)?.count ?? 0,
    }))

  const confidencePct = Math.round(quality.avg_confidence * 100)
  const confidenceColor =
    confidencePct >= 85 ? "green" : confidencePct >= 70 ? "orange" : "red"

  return (
    <div className="space-y-8 animate-fade-up">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Adaptación digital y monetización — SAFPRO {new Date().toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ══════════════ SECCIÓN 1: OVERVIEW ══════════════════════════════════════ */}
      <Section title="Overview" icon={<BarChart2 className="h-4 w-4" />}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Usuarios totales"
            value={overview.total_users}
            icon={<Users className="h-4 w-4" />}
            color="blue"
          />
          <KpiCard
            label="Tasa de activación"
            value={`${overview.activation_rate}%`}
            sub={`${overview.activated_users} de ${overview.total_users} subieron algo`}
            icon={<Zap className="h-4 w-4" />}
            color="orange"
          />
          <KpiCard
            label="Uploads totales"
            value={overview.total_uploads}
            sub={`${overview.total_analyses} análisis`}
            icon={<Upload className="h-4 w-4" />}
            color="green"
          />
          <KpiCard
            label="Jobs fallidos"
            value={overview.failed_jobs}
            sub={overview.failed_jobs > 0 ? "Ver tabla abajo" : "Todo OK ✓"}
            icon={<AlertTriangle className="h-4 w-4" />}
            color={overview.failed_jobs > 0 ? "red" : "green"}
          />
        </div>

        {/* Plan distribution + Funnel de activación */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Pie: distribución por plan */}
          <div className="zoho-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Distribución por plan</p>
            </div>
            {planData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={planData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={64}
                      paddingAngle={2}
                    >
                      {planData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v} usuarios`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2">
                  {planData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                      <span className="font-medium">{entry.name}</span>
                      <span className="ml-auto text-muted-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin datos de plan</p>
            )}
          </div>

          {/* Funnel de activación */}
          <div className="zoho-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Funnel de activación</p>
            </div>
            <div className="space-y-2 pt-1">
              {[
                { label: "Registrados", value: overview.total_users, pct: 100, color: "#6366f1" },
                { label: "Con ≥1 upload", value: overview.activated_users, pct: overview.activation_rate, color: "#f59e0b" },
                { label: "Con ≥2 análisis (retenidos)", value: retention.users_with_2plus_analyses, pct: overview.total_users ? Math.round(retention.users_with_2plus_analyses / overview.total_users * 100) : 0, color: "#10b981" },
              ].map(({ label, value, pct, color }) => (
                <div key={label} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold">{value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════ SECCIÓN 2: TENDENCIAS ════════════════════════════════════ */}
      {trendData.length > 0 && (
        <Section title="Tendencias mensuales" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="zoho-card p-4">
            <p className="text-xs text-muted-foreground mb-3">Nuevos usuarios y uploads por mes (últimos 12 meses)</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="uploads" name="Uploads" fill="#6366f1" opacity={0.8} radius={[3, 3, 0, 0]} />
                <Line dataKey="usuarios" name="Nuevos usuarios" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* ══════════════ SECCIÓN 3: CALIDAD ═══════════════════════════════════════ */}
      <Section title="Calidad del sistema" icon={<Brain className="h-4 w-4" />}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Confianza promedio"
            value={`${confidencePct}%`}
            sub="Target: ≥85%"
            icon={<CheckCircle2 className="h-4 w-4" />}
            color={confidenceColor}
          />
          <KpiCard
            label="Transacciones totales"
            value={quality.total_transactions.toLocaleString()}
            icon={<BarChart2 className="h-4 w-4" />}
            color="blue"
          />
          <KpiCard
            label="Sin clasificar"
            value={`${quality.low_confidence_ratio}%`}
            sub={`${quality.low_confidence_count} txs con confidence < 0.8`}
            icon={<AlertTriangle className="h-4 w-4" />}
            color={quality.low_confidence_ratio > 20 ? "red" : quality.low_confidence_ratio > 10 ? "orange" : "green"}
          />
          <KpiCard
            label="Retención"
            value={`${retention.retention_rate}%`}
            sub={`${retention.users_with_2plus_analyses} usuarios con >1 análisis`}
            icon={<TrendingUp className="h-4 w-4" />}
            color={retention.retention_rate >= 50 ? "green" : "orange"}
          />
        </div>

        {/* Clasificación por método */}
        {methodData.length > 0 && (
          <div className="zoho-card p-4">
            <p className="text-sm font-semibold mb-1">Distribución por método de clasificación</p>
            <p className="text-xs text-muted-foreground mb-3">
              Un mayor porcentaje en KB Personal/Global indica que el sistema está aprendiendo. Fallback alto = más entrenamiento necesario.
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={methodData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="method" type="category" tick={{ fontSize: 10 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" name="Transacciones" radius={[0, 3, 3, 0]}>
                  {methodData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ══════════════ SECCIÓN 4: RETENCIÓN ═════════════════════════════════════ */}
      <Section title="Retención y uso" icon={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Métricas de uso */}
          <div className="zoho-card p-4 space-y-3">
            <p className="text-sm font-semibold">Métricas de uso promedio</p>
            <div className="space-y-3">
              {[
                {
                  label: "Uploads por usuario activo",
                  value: retention.avg_uploads_per_user,
                  max: 10,
                  color: "#6366f1",
                },
                {
                  label: "Análisis por usuario activo",
                  value: retention.avg_analyses_per_user,
                  max: 10,
                  color: "#10b981",
                },
              ].map(({ label, value, max, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-bold">{value}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(value / max * 100, 100)}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold">{retention.users_with_1_analysis}</p>
                <p className="text-xs text-muted-foreground">Solo 1 análisis</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">{retention.users_with_2plus_analyses}</p>
                <p className="text-xs text-muted-foreground">2+ análisis (retenidos)</p>
              </div>
            </div>
          </div>

          {/* Bancos */}
          {top_banks.length > 0 && (
            <div className="zoho-card p-4 space-y-3">
              <p className="text-sm font-semibold">Uploads por banco</p>
              <div className="space-y-2">
                {top_banks.map((b, i) => {
                  const maxCount = top_banks[0].count
                  return (
                    <div key={b.bank} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: BANK_COLORS[i] ?? "#94a3b8" }}
                          />
                          {b.bank}
                        </span>
                        <span className="font-semibold">{b.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(b.count / maxCount * 100)}%`,
                            background: BANK_COLORS[i] ?? "#94a3b8",
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ══════════════ SECCIÓN 5: GESTIÓN DE USUARIOS ══════════════════════════ */}
      <UserManager />

      {/* ══════════════ SECCIÓN 6: JOBS FALLIDOS — GESTIÓN ══════════════════════ */}
      <FailedJobsManager />

      {/* ══════════════ SECCIÓN 7: COMUNICACIONES — EMAIL ═══════════════════════ */}
      <EmailComposer />

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        Datos en tiempo real desde PostgreSQL · Solo visible para administradores · SAFPRO {new Date().getFullYear()}
      </div>
    </div>
  )
}
