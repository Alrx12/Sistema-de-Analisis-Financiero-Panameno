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
} from "lucide-react"
import { getAnalytics } from "@/api/analytics"
import {
  getAdminJobs,
  retryFailedJob,
  discardFailedFile,
  getFailedFileDownloadUrl,
  type AdminFailedJob,
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
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
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

      {/* ══════════════ SECCIÓN 5: JOBS FALLIDOS — GESTIÓN ══════════════════════ */}
      <FailedJobsManager />

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        Datos en tiempo real desde PostgreSQL · Solo visible para administradores · SAFPRO {new Date().getFullYear()}
      </div>
    </div>
  )
}
