import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  User,
  Crown,
  Briefcase,
  DollarSign,
  Target,
  AlertTriangle,
  Trash2,
  FolderX,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Shield,
  Loader2,
  Save,
} from "lucide-react"
import { getProfile, updateProfile } from "@/api/profile"
import { deleteMyAccount, deleteMyUploads } from "@/api/users"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/toast"
import type { IndustryType, GoalType, UserProfileUpdate } from "@/types"

// ─── Opciones ─────────────────────────────────────────────────────────────────

const INDUSTRIES: { value: IndustryType; label: string; emoji: string }[] = [
  { value: "tecnologia",   label: "Tecnología",                  emoji: "💻" },
  { value: "salud",        label: "Salud",                        emoji: "🏥" },
  { value: "educacion",    label: "Educación",                    emoji: "📚" },
  { value: "finanzas",     label: "Finanzas / Banca",             emoji: "🏦" },
  { value: "comercio",     label: "Comercio / Retail",            emoji: "🛒" },
  { value: "construccion", label: "Construcción",                 emoji: "🏗️" },
  { value: "gobierno",     label: "Gobierno / Sector público",    emoji: "🏛️" },
  { value: "transporte",   label: "Transporte / Logística",       emoji: "🚛" },
  { value: "servicios",    label: "Servicios profesionales",      emoji: "💼" },
  { value: "otro",         label: "Otro",                         emoji: "⚡" },
]

const GOALS: { value: GoalType; label: string; emoji: string }[] = [
  { value: "fondo_emergencia", label: "Fondo de emergencia",  emoji: "🛡️" },
  { value: "ahorro_general",   label: "Ahorrar más",          emoji: "🐖" },
  { value: "eliminar_deuda",   label: "Eliminar deudas",      emoji: "✂️" },
  { value: "invertir",         label: "Empezar a invertir",   emoji: "📈" },
  { value: "meta_especifica",  label: "Meta específica",      emoji: "🎯" },
]

// ─── Plan badge ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, { label: string; bg: string; color: string }> = {
    friends_and_family: {
      label: "Friends & Family",
      bg: "rgba(99,102,241,0.1)",
      color: "#6366f1",
    },
    pro: {
      label: "Pro",
      bg: "rgba(234,179,8,0.12)",
      color: "#ca8a04",
    },
    free: {
      label: "Gratis",
      bg: "rgba(107,114,128,0.1)",
      color: "#6b7280",
    },
  }
  const s = styles[plan] ?? styles.free
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      <Crown className="h-3 w-3" />
      {s.label}
    </span>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function AccountPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  // ── Profile query ────────────────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  // ── Form state (sync'd from profile once loaded) ─────────────────────────────
  const [industry, setIndustry]     = useState<IndustryType | null>(null)
  const [income, setIncome]         = useState<string>("")
  const [goals, setGoals]           = useState<GoalType[]>([])
  const [formReady, setFormReady]   = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const [goalsOpen, setGoalsOpen]   = useState(false)

  // Populate form when profile loads (only once)
  if (profile && !formReady) {
    setIndustry(profile.industry)
    setIncome(profile.expected_monthly_income?.toString() ?? "")
    setGoals(profile.financial_goals ?? [])
    setFormReady(true)
  }

  // ── Update profile mutation ───────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: UserProfileUpdate) => updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      setProfileDirty(false)
    },
  })

  function handleSaveProfile() {
    updateMutation.mutate({
      industry,
      expected_monthly_income: income ? parseFloat(income) : null,
      financial_goals: goals,
      onboarding_completed: profile?.onboarding_completed ?? true,
      manual_expenses: profile?.manual_expenses,
    })
  }

  function toggleGoal(g: GoalType) {
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])
    setProfileDirty(true)
  }

  // ── Danger zone modals ────────────────────────────────────────────────────────
  const [confirmUploads, setConfirmUploads]   = useState(false)
  const [confirmAccount, setConfirmAccount]   = useState(false)
  const [confirmText, setConfirmText]         = useState("")

  const deleteUploadsMutation = useMutation({
    mutationFn: deleteMyUploads,
    onSuccess: (data) => {
      setConfirmUploads(false)
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["analysis"] })
      const count = data?.records_deleted ?? 0
      toast(
        count > 0
          ? `${count} registro${count !== 1 ? "s" : ""} de archivo eliminado${count !== 1 ? "s" : ""} correctamente.`
          : "No había archivos registrados para eliminar.",
        count > 0 ? "success" : "info"
      )
    },
    onError: () => {
      toast("Error al borrar los archivos. Intenta de nuevo.", "error")
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: () => {
      logout()
      navigate("/login")
    },
  })

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U"

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Mi Cuenta</h1>
          <p className="page-subtitle">Gestiona tu perfil, suscripción y preferencias</p>
        </div>
      </div>

      {/* ─────────────────────────── SECCIÓN 1: Cuenta ─────────────────────────── */}
      <div className="zoho-card p-5 space-y-4">
        <div className="flex items-center gap-3 pb-1 border-b border-border">
          <div className="kpi-icon-blue">
            <User className="h-4 w-4" />
          </div>
          <h2 className="font-semibold text-sm">Información de cuenta</h2>
        </div>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white text-lg font-bold"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            {initials}
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-sm">{user?.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <PlanBadge plan={user?.plan ?? "free"} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-muted-foreground mb-0.5">Usuario</p>
            <p className="font-medium">@{user?.username}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-muted-foreground mb-0.5">Miembro desde</p>
            <p className="font-medium">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString("es-PA", { year: "numeric", month: "long" })
                : "—"}
            </p>
          </div>
        </div>

        {/* Plan info */}
        {user?.plan === "free" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2 text-xs">
            <Crown className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-700">Plan Gratuito — 3 análisis incluidos</p>
              <p className="text-amber-600/80">Actualiza a Pro para análisis ilimitados e historial completo.</p>
            </div>
          </div>
        )}
        {user?.plan === "friends_and_family" && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2.5 flex items-start gap-2 text-xs">
            <Shield className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
            <p className="text-indigo-700">
              Acceso <strong>Friends &amp; Family</strong> — todas las funciones habilitadas mientras estamos en beta.
            </p>
          </div>
        )}
      </div>

      {/* ─────────────────── SECCIÓN 2: Perfil financiero ────────────────────── */}
      <div className="zoho-card p-5 space-y-4">
        <div className="flex items-center gap-3 pb-1 border-b border-border">
          <div className="kpi-icon-orange">
            <Target className="h-4 w-4" />
          </div>
          <h2 className="font-semibold text-sm">Perfil financiero</h2>
          <p className="text-xs text-muted-foreground ml-auto">Se refleja en Dashboard y Presupuesto</p>
        </div>

        {profileLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando perfil…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Industria */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                Industria
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {INDUSTRIES.map(({ value, label, emoji }) => (
                  <button
                    key={value}
                    onClick={() => { setIndustry(value); setProfileDirty(true) }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors",
                      industry === value
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:border-primary/40 hover:bg-accent"
                    )}
                  >
                    <span>{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ingreso mensual */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Ingreso mensual neto
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={income}
                  onChange={(e) => { setIncome(e.target.value); setProfileDirty(true) }}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-background pl-7 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Después de impuestos. Usado para comparar contra tus gastos reales en el presupuesto 50/30/20.
              </p>
            </div>

            {/* Metas financieras (collapsible) */}
            <div className="space-y-1.5">
              <button
                onClick={() => setGoalsOpen((p) => !p)}
                className="flex w-full items-center gap-1.5 text-xs font-medium hover:text-primary transition-colors"
              >
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                Metas financieras
                <span className="ml-1 text-muted-foreground font-normal">
                  ({goals.length} seleccionada{goals.length !== 1 ? "s" : ""})
                </span>
                <span className="ml-auto">
                  {goalsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              </button>

              {/* Selected goals preview when collapsed */}
              {!goalsOpen && goals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {goals.map((g) => {
                    const opt = GOALS.find((x) => x.value === g)
                    return opt ? (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full bg-primary/8 border border-primary/20 px-2 py-0.5 text-xs text-primary font-medium">
                        {opt.emoji} {opt.label}
                      </span>
                    ) : null
                  })}
                </div>
              )}

              {goalsOpen && (
                <div className="space-y-1.5 pt-1">
                  {GOALS.map(({ value, label, emoji }) => {
                    const selected = goals.includes(value)
                    return (
                      <button
                        key={value}
                        onClick={() => toggleGoal(value)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg border p-3 text-left text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-accent"
                        )}
                      >
                        <span className="text-sm">{emoji}</span>
                        <span className={cn("flex-1 font-medium", selected && "text-primary")}>{label}</span>
                        {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={!profileDirty || updateMutation.isPending}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  profileDirty
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-default"
                )}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </button>
              {updateMutation.isSuccess && !profileDirty && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Guardado
                </span>
              )}
              {updateMutation.isError && (
                <span className="text-xs text-red-500">Error al guardar. Intenta de nuevo.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────── SECCIÓN 3: Zona peligrosa ───────────────────── */}
      <div className="zoho-card p-5 space-y-4 border-red-200">
        <div className="flex items-center gap-3 pb-1 border-b border-red-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <h2 className="font-semibold text-sm text-red-700">Zona peligrosa</h2>
        </div>

        <div className="space-y-3">
          {/* Borrar estados de cuenta */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-800">Borrar estados de cuenta subidos</p>
              <p className="text-xs text-amber-700/80">
                Elimina los archivos Excel que subiste. Tus análisis, transacciones y categorías se conservan intactos.
                Podrás volver a subir los mismos archivos sin recibir error de duplicado.
              </p>
            </div>
            <button
              onClick={() => setConfirmUploads(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors"
            >
              <FolderX className="h-3.5 w-3.5" />
              Borrar archivos
            </button>
          </div>

          {/* Eliminar cuenta */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50/60 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-800">Eliminar mi cuenta</p>
              <p className="text-xs text-red-700/80">
                Borra permanentemente tu cuenta y todos tus datos — análisis, transacciones,
                perfil financiero y archivos. Esta acción es irreversible y no se puede deshacer.
              </p>
            </div>
            <button
              onClick={() => { setConfirmText(""); setConfirmAccount(true) }}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-red-400 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar cuenta
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────── MODAL: Confirmar borrar uploads ──────────────────── */}
      {confirmUploads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-fade-up">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <FolderX className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">¿Borrar estados de cuenta?</p>
                <p className="text-xs text-muted-foreground">Tus análisis se conservan.</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se eliminarán todos los archivos Excel que subiste y sus registros de deduplicación.
              Podrás volver a subirlos en cualquier momento sin recibir un error de archivo duplicado.
              Todos tus análisis, transacciones, categorías y el Knowledge Base permanecen intactos.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setConfirmUploads(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                disabled={deleteUploadsMutation.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteUploadsMutation.mutate()}
                disabled={deleteUploadsMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
              >
                {deleteUploadsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderX className="h-4 w-4" />
                )}
                {deleteUploadsMutation.isPending ? "Borrando…" : "Sí, borrar archivos"}
              </button>
            </div>
            {deleteUploadsMutation.isError && (
              <p className="text-xs text-red-500">Ocurrió un error. Intenta de nuevo.</p>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: Confirmar eliminar cuenta ─────────────────── */}
      {confirmAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-fade-up">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Eliminar cuenta permanentemente</p>
                <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se eliminarán de forma permanente: tu cuenta, todos tus análisis, transacciones,
              perfil financiero, archivos subidos, billeteras, metas de ahorro y tu Knowledge Base personal.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-red-700">
                Escribe <span className="font-bold font-mono">ELIMINAR</span> para confirmar
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="w-full rounded-md border border-red-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setConfirmAccount(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                disabled={deleteAccountMutation.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteAccountMutation.mutate()}
                disabled={confirmText !== "ELIMINAR" || deleteAccountMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteAccountMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleteAccountMutation.isPending ? "Eliminando…" : "Eliminar mi cuenta"}
              </button>
            </div>
            {deleteAccountMutation.isError && (
              <p className="text-xs text-red-500">Ocurrió un error. Intenta de nuevo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
