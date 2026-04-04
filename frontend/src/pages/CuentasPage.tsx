/**
 * CuentasPage — Gestión de cuentas manuales y metas de ahorro
 * Inspirado en Finadyx: sección Cuentas + sección Metas (Ahorros)
 */
import { useState, useEffect } from "react"
import {
  CreditCard, Wallet, Landmark, Smartphone, DollarSign,
  Star, Home, Car, Plane, GraduationCap, Heart, Shield,
  TrendingUp, Leaf, Gift, Plus, Pencil, Trash2, Loader2,
  Target, ChevronRight, X, Check, Banknote,
  PiggyBank, RefreshCw,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { listWallets, createWallet, updateWallet, deleteWallet } from "@/api/wallets"
import { listGoals, createGoal, updateGoal, depositToGoal, deleteGoal } from "@/api/goals"
import { listAnalysis } from "@/api/analysis"
import { updateAccount } from "@/api/accounts"
import type { ManualWallet, SavingsGoal, AnalysisSnapshot, WalletCreate, GoalCreate } from "@/types"
import { formatCurrency, cn } from "@/lib/utils"
import ProGate from "@/components/ProGate"

// ─── Mapas de íconos disponibles ──────────────────────────────────────────────

const WALLET_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  CreditCard:  { icon: CreditCard,  label: "Tarjeta" },
  Wallet:      { icon: Wallet,      label: "Billetera" },
  Landmark:    { icon: Landmark,    label: "Banco" },
  Smartphone:  { icon: Smartphone,  label: "Digital" },
  DollarSign:  { icon: DollarSign,  label: "Efectivo" },
  Banknote:    { icon: Banknote,    label: "Billete" },
}

const GOAL_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  Star:           { icon: Star,          label: "Meta" },
  Home:           { icon: Home,          label: "Casa" },
  Car:            { icon: Car,           label: "Auto" },
  Plane:          { icon: Plane,         label: "Viaje" },
  GraduationCap:  { icon: GraduationCap, label: "Educación" },
  Heart:          { icon: Heart,         label: "Salud" },
  Shield:         { icon: Shield,        label: "Emergencia" },
  TrendingUp:     { icon: TrendingUp,    label: "Inversión" },
  Leaf:           { icon: Leaf,          label: "Sustentable" },
  Gift:           { icon: Gift,          label: "Regalo" },
  PiggyBank:      { icon: PiggyBank,     label: "Ahorro" },
}

const PALETTE = [
  "#8B5CF6", "#6366F1", "#3B82F6", "#0EA5E9", "#10B981",
  "#F59E0B", "#F97316", "#EC4899", "#DC2626", "#6B7280",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function WalletIcon({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const cfg = WALLET_ICONS[name] ?? WALLET_ICONS["Wallet"]
  const Icon = cfg.icon
  return <Icon style={{ color, width: size, height: size }} />
}

function GoalIconComp({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const cfg = GOAL_ICONS[name] ?? GOAL_ICONS["Star"]
  const Icon = cfg.icon
  return <Icon style={{ color, width: size, height: size }} />
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  )
}

// ─── Modal genérico ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-up">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Billetera ────────────────────────────────────────────────────────

function WalletModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: ManualWallet
  onSave: (data: WalletCreate) => Promise<void>
  onClose: () => void
}) {
  const [name, setName]         = useState(initial?.name ?? "")
  const [walletType, setType]   = useState<"card"|"cash"|"savings"|"other">(
    (initial?.wallet_type as "card"|"cash"|"savings"|"other") ?? "cash"
  )
  const [icon, setIcon]         = useState(initial?.icon ?? "Wallet")
  const [color, setColor]       = useState(initial?.color ?? "#6B7280")
  const [balance, setBalance]   = useState(String(initial?.current_balance ?? "0"))
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState("")

  async function submit() {
    if (!name.trim()) { setErr("El nombre es requerido"); return }
    setSaving(true)
    setErr("")
    try {
      await onSave({ name: name.trim(), wallet_type: walletType, icon, color, current_balance: parseFloat(balance) || 0 })
      onClose()
    } catch { setErr("Error al guardar") }
    finally { setSaving(false) }
  }

  return (
    <Modal title={initial ? "Editar billetera" : "Nueva billetera"} onClose={onClose}>
      {/* Nombre */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Nombre</label>
        <input
          className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Tarjeta BAC, Efectivo, etc."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Tipo</label>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {([["card","💳 Tarjeta"],["cash","💵 Efectivo"],["savings","🏦 Ahorro"],["other","📦 Otro"]] as const).map(([t, l]) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={cn("py-2 rounded-xl text-xs font-medium border-2 transition-all",
                walletType === t ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              )}>{l}</button>
          ))}
        </div>
      </div>

      {/* Ícono */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Ícono</label>
        <div className="mt-1 flex gap-2 flex-wrap">
          {Object.entries(WALLET_ICONS).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button key={key} type="button" onClick={() => setIcon(key)}
                className={cn("h-10 w-10 flex items-center justify-center rounded-xl border-2 transition-all",
                  icon === key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                )}>
                <Icon className="h-5 w-5" style={{ color: icon === key ? color : "#6B7280" }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Color</label>
        <div className="mt-1 flex gap-2 flex-wrap">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center"
              style={{ background: c, borderColor: color === c ? "#1c2b4b" : "transparent" }}>
              {color === c && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Saldo */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Saldo actual (B/.)</label>
        <input
          type="number" min="0" step="0.01"
          className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
        />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <button
        type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Check className="h-4 w-4" /> Guardar</>}
      </button>
    </Modal>
  )
}

// ─── Modal de Meta ─────────────────────────────────────────────────────────────

function GoalModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: SavingsGoal
  onSave: (data: GoalCreate) => Promise<void>
  onClose: () => void
}) {
  const [name, setName]       = useState(initial?.name ?? "")
  const [icon, setIcon]       = useState(initial?.icon ?? "Star")
  const [color, setColor]     = useState(initial?.color ?? "#8B5CF6")
  const [target, setTarget]   = useState(String(initial?.target_amount ?? ""))
  const [current, setCurrent] = useState(String(initial?.current_amount ?? "0"))
  const [deadline, setDeadline] = useState(initial?.deadline ?? "")
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState("")

  async function submit() {
    if (!name.trim()) { setErr("El nombre es requerido"); return }
    if (!target || parseFloat(target) <= 0) { setErr("El monto objetivo debe ser mayor a 0"); return }
    setSaving(true)
    setErr("")
    try {
      await onSave({
        name: name.trim(), icon, color,
        target_amount: parseFloat(target),
        current_amount: parseFloat(current) || 0,
        deadline: deadline || null,
      })
      onClose()
    } catch { setErr("Error al guardar") }
    finally { setSaving(false) }
  }

  return (
    <Modal title={initial ? "Editar meta" : "Nueva meta de ahorro"} onClose={onClose}>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Nombre de la meta</label>
        <input
          className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Fondo de emergencia, Viaje a Europa…"
          value={name} onChange={(e) => setName(e.target.value)} maxLength={200}
        />
      </div>

      {/* Ícono */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Ícono</label>
        <div className="mt-1 flex gap-2 flex-wrap">
          {Object.entries(GOAL_ICONS).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button key={key} type="button" onClick={() => setIcon(key)}
                className={cn("h-10 w-10 flex items-center justify-center rounded-xl border-2 transition-all",
                  icon === key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                )}>
                <Icon className="h-5 w-5" style={{ color: icon === key ? color : "#6B7280" }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Color</label>
        <div className="mt-1 flex gap-2 flex-wrap">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all"
              style={{ background: c, borderColor: color === c ? "#1c2b4b" : "transparent" }}>
              {color === c && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Meta (B/.)</label>
          <input type="number" min="0.01" step="0.01"
            className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="1000.00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Ahorrado (B/.)</label>
          <input type="number" min="0" step="0.01"
            className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="0.00" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Fecha límite (opcional)</label>
        <input type="date"
          className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <button type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Check className="h-4 w-4" /> Guardar</>}
      </button>
    </Modal>
  )
}

// ─── Modal de Depósito a meta ─────────────────────────────────────────────────

function DepositModal({
  goal,
  onDeposit,
  onClose,
}: {
  goal: SavingsGoal
  onDeposit: (amount: number) => Promise<void>
  onClose: () => void
}) {
  const [amount, setAmount] = useState("")
  const [mode, setMode]     = useState<"add" | "withdraw">("add")
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState("")

  async function submit() {
    const n = parseFloat(amount)
    if (!n || n <= 0) { setErr("Ingresa un monto válido"); return }
    setSaving(true)
    setErr("")
    try {
      await onDeposit(mode === "add" ? n : -n)
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(msg ?? "Error al actualizar")
    }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Actualizar: ${goal.name}`} onClose={onClose}>
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("add")}
          className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
            mode === "add" ? "border-green-500 bg-green-50 text-green-700" : "border-border"
          )}>+ Abonar</button>
        <button type="button" onClick={() => setMode("withdraw")}
          className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
            mode === "withdraw" ? "border-destructive bg-destructive/10 text-destructive" : "border-border"
          )}>− Retirar</button>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Monto (B/.)</label>
        <input type="number" min="0.01" step="0.01" autoFocus
          className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Saldo actual: <strong>{formatCurrency(goal.current_amount)}</strong> / Meta: <strong>{formatCurrency(goal.target_amount)}</strong>
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Actualizando…</> : <><Check className="h-4 w-4" /> Confirmar</>}
      </button>
    </Modal>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Tab = "cuentas" | "metas"

export default function CuentasPage() {
  const [tab, setTab] = useState<Tab>("cuentas")

  // Wallets
  const [wallets, setWallets]       = useState<ManualWallet[]>([])
  const [loadingW, setLoadingW]     = useState(true)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [editWallet, setEditWallet] = useState<ManualWallet | undefined>()
  const [deletingWId, setDeletingWId] = useState<string | null>(null)

  // Goals
  const [goals, setGoals]           = useState<SavingsGoal[]>([])
  const [loadingG, setLoadingG]     = useState(true)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [editGoal, setEditGoal]     = useState<SavingsGoal | undefined>()
  const [depositGoal, setDepositGoal] = useState<SavingsGoal | undefined>()
  const [deletingGId, setDeletingGId] = useState<string | null>(null)

  // Linked bank accounts (snapshots)
  const [snapshots, setSnapshots]   = useState<AnalysisSnapshot[]>([])

  // Edición de saldo disponible por cuenta bancaria
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null)
  const [balanceInput, setBalanceInput]         = useState("")
  const [savingBalance, setSavingBalance]       = useState(false)

  useEffect(() => {
    fetchWallets()
    fetchGoals()
    fetchSnapshots()
  }, [])

  async function fetchWallets() {
    setLoadingW(true)
    try { setWallets(await listWallets()) }
    catch { /* silent */ }
    finally { setLoadingW(false) }
  }

  async function fetchGoals() {
    setLoadingG(true)
    try { setGoals(await listGoals()) }
    catch { /* silent */ }
    finally { setLoadingG(false) }
  }

  async function fetchSnapshots() {
    try {
      const snaps = await listAnalysis()
      // Desduplicar por banco — quedarnos con el snapshot más reciente por cuenta
      const byAccount = new Map<string, AnalysisSnapshot>()
      snaps.forEach((s) => {
        const key = s.bank_account?.account_id ?? `no-account-${s.snapshot_id}`
        const existing = byAccount.get(key)
        if (!existing || s.created_at > existing.created_at) {
          byAccount.set(key, s)
        }
      })
      setSnapshots(Array.from(byAccount.values()))
    } catch { /* silent */ }
  }

  // ── Acciones de Wallets ──
  async function handleSaveWallet(data: WalletCreate) {
    if (editWallet) {
      const updated = await updateWallet(editWallet.wallet_id, data)
      setWallets((prev) => prev.map((w) => w.wallet_id === updated.wallet_id ? updated : w))
    } else {
      const created = await createWallet(data)
      setWallets((prev) => [...prev, created])
    }
    setEditWallet(undefined)
    setShowWalletModal(false)
  }

  async function handleDeleteWallet(id: string) {
    setDeletingWId(id)
    try {
      await deleteWallet(id)
      setWallets((prev) => prev.filter((w) => w.wallet_id !== id))
    } catch { /* silent */ }
    finally { setDeletingWId(null) }
  }

  // ── Acciones de Goals ──
  async function handleSaveGoal(data: GoalCreate) {
    if (editGoal) {
      const updated = await updateGoal(editGoal.goal_id, data)
      setGoals((prev) => prev.map((g) => g.goal_id === updated.goal_id ? updated : g))
    } else {
      const created = await createGoal(data)
      setGoals((prev) => [...prev, created])
    }
    setEditGoal(undefined)
    setShowGoalModal(false)
  }

  async function handleDeposit(amount: number) {
    if (!depositGoal) return
    const updated = await depositToGoal(depositGoal.goal_id, amount)
    setGoals((prev) => prev.map((g) => g.goal_id === updated.goal_id ? updated : g))
    setDepositGoal(undefined)
  }

  async function handleDeleteGoal(id: string) {
    setDeletingGId(id)
    try {
      await deleteGoal(id)
      setGoals((prev) => prev.filter((g) => g.goal_id !== id))
    } catch { /* silent */ }
    finally { setDeletingGId(null) }
  }

  async function handleSaveAvailableBalance(accountId: string) {
    const val = parseFloat(balanceInput)
    if (isNaN(val) || val < 0) return
    setSavingBalance(true)
    try {
      await updateAccount(accountId, { available_balance: val })
      // Actualizar el available_balance en el snapshot local
      setSnapshots(prev => prev.map(s => {
        if (s.bank_account?.account_id === accountId) {
          return { ...s, bank_account: { ...s.bank_account!, available_balance: val } }
        }
        return s
      }))
      setEditingBalanceId(null)
    } catch { /* silent */ }
    finally { setSavingBalance(false) }
  }

  // ── Totales ──
  const totalWallets  = wallets.reduce((s, w) => s + w.current_balance, 0)
  const totalGoalsCur = goals.reduce((s, g) => s + g.current_amount, 0)
  const totalGoalsTgt = goals.reduce((s, g) => s + g.target_amount, 0)
  const totalBankBal  = snapshots.reduce((s, snap) => s + (snap.balance ?? 0), 0)

  // Cuentas bancarias reales (excluye Manual)
  const linkedAccounts = snapshots.filter(s => s.bank_account && s.bank_account.bank_name !== "Manual")
  // Saldo disponible: suma de los que tienen available_balance configurado
  const accountsWithAvailBalance = linkedAccounts.filter(s => s.bank_account!.available_balance != null)
  const totalAvailableBank = accountsWithAvailBalance.reduce(
    (s, snap) => s + (snap.bank_account!.available_balance ?? 0), 0
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis Cuentas</h1>
          <p className="page-subtitle">Billeteras, cuentas bancarias y metas de ahorro</p>
        </div>
      </div>

      {/* KPI general */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="zoho-card border-0 p-2 sm:p-4 text-center overflow-hidden">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Billeteras</p>
          <p className="text-sm sm:text-lg font-bold text-foreground tabular-nums">{formatCurrency(totalWallets)}</p>
        </div>
        <div className="zoho-card border-0 p-2 sm:p-4 text-center overflow-hidden">
          {accountsWithAvailBalance.length > 0 ? (
            <>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Disp. bancos</p>
              <p className={cn("text-sm sm:text-lg font-bold tabular-nums", totalAvailableBank >= 0 ? "text-green-600" : "text-destructive")}>
                {formatCurrency(totalAvailableBank)}
              </p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                Bal: {formatCurrency(totalBankBal)}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Bancos</p>
              <p className={cn("text-sm sm:text-lg font-bold tabular-nums", totalBankBal >= 0 ? "text-green-600" : "text-destructive")}>
                {formatCurrency(totalBankBal)}
              </p>
            </>
          )}
        </div>
        <div className="zoho-card border-0 p-2 sm:p-4 text-center overflow-hidden">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">En metas</p>
          <p className="text-sm sm:text-lg font-bold text-primary tabular-nums">{formatCurrency(totalGoalsCur)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        {([["cuentas","💳 Cuentas"],["metas","🎯 Metas de Ahorro"]] as const).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
              tab === t ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}>{l}</button>
        ))}
      </div>

      {/* ══ TAB: Cuentas ══ */}
      {tab === "cuentas" && (
        <div className="space-y-4">

          {/* ── Billeteras manuales ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mis Billeteras</p>
              <button
                type="button"
                onClick={() => { setEditWallet(undefined); setShowWalletModal(true) }}
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>

            {loadingW ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : wallets.length === 0 ? (
              <div className="zoho-card border-0 p-8 text-center text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No tienes billeteras aún</p>
                <p className="text-xs mt-1">Agrega Tarjeta, Efectivo u otras cuentas</p>
                <button
                  type="button"
                  onClick={() => { setEditWallet(undefined); setShowWalletModal(true) }}
                  className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold"
                >
                  + Crear billetera
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((w) => (
                  <div key={w.wallet_id}
                    className="flex items-center gap-2 sm:gap-4 bg-white rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm border border-border/50">
                    <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full"
                      style={{ background: w.color + "20" }}>
                      <WalletIcon name={w.icon} color={w.color} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate">{w.name}</p>
                        {w.is_default && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Principal</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{w.wallet_type}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm sm:text-base font-bold tabular-nums">{formatCurrency(w.current_balance)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button"
                        onClick={() => { setEditWallet(w); setShowWalletModal(true) }}
                        className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button"
                        onClick={() => handleDeleteWallet(w.wallet_id)}
                        disabled={deletingWId === w.wallet_id}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                        {deletingWId === w.wallet_id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Cuentas bancarias vinculadas a análisis ── */}
          {linkedAccounts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cuentas Bancarias Vinculadas</p>
              <div className="space-y-2">
                {linkedAccounts.map((snap) => {
                  const ba = snap.bank_account!
                  const bal = snap.balance
                  const avail = ba.available_balance
                  const isEditingThis = editingBalanceId === ba.account_id
                  return (
                    <div key={snap.snapshot_id}
                      className="bg-white rounded-xl px-4 py-3.5 shadow-sm border border-border/50">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50">
                          <Landmark className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{ba.bank_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ba.account_last4 ? `···· ${ba.account_last4}` : "Sin número"} · Auto-detectada
                          </p>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <p className={cn("text-base font-bold", bal >= 0 ? "text-green-600" : "text-destructive")}>
                            {formatCurrency(bal)}
                          </p>
                          <p className="text-xs text-muted-foreground">Balance calculado</p>
                        </div>
                      </div>

                      {/* Saldo en cuenta */}
                      <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between gap-3">
                        <div className="flex items-start gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5" />
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">Saldo en cuenta</span>
                            {avail != null && !isEditingThis && (
                              <p className="text-[10px] text-muted-foreground/60 leading-tight">según estado de cuenta</p>
                            )}
                          </div>
                        </div>

                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={balanceInput}
                              onChange={e => setBalanceInput(e.target.value)}
                              className="w-28 rounded-lg border border-input px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="0.00"
                              autoFocus
                            />
                            <button type="button"
                              onClick={() => handleSaveAvailableBalance(ba.account_id)}
                              disabled={savingBalance}
                              className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60">
                              {savingBalance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                            <button type="button"
                              onClick={() => setEditingBalanceId(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : avail != null ? (
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-bold", avail >= 0 ? "text-green-600" : "text-destructive")}>
                              {formatCurrency(avail)}
                            </span>
                            <button type="button"
                              onClick={() => { setEditingBalanceId(ba.account_id); setBalanceInput(String(avail)) }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                              title="Corregir saldo manualmente">
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button type="button"
                            onClick={() => { setEditingBalanceId(ba.account_id); setBalanceInput("") }}
                            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                            <Plus className="h-3 w-3" /> Configurar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                El saldo en cuenta se toma del último movimiento de tu estado de cuenta.
                Puedes corregirlo manualmente si es necesario.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: Metas ══ */}
      {tab === "metas" && (
        <ProGate
          feature="Metas de Ahorro"
          description="Crea y gestiona metas de ahorro con seguimiento de progreso, depósitos y retiros. Mantén el foco en tus objetivos financieros."
          variant="section"
        >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metas de Ahorro</p>
            <button
              type="button"
              onClick={() => { setEditGoal(undefined); setShowGoalModal(true) }}
              className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva meta
            </button>
          </div>

          {/* Progreso total */}
          {goals.length > 0 && totalGoalsTgt > 0 && (
            <div className="zoho-card border-0 p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Progreso total</p>
                <p className="text-sm font-bold text-primary">
                  {formatCurrency(totalGoalsCur)} / {formatCurrency(totalGoalsTgt)}
                </p>
              </div>
              <ProgressBar pct={totalGoalsTgt > 0 ? (totalGoalsCur / totalGoalsTgt) * 100 : 0} color="#e05c19" />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {totalGoalsTgt > 0 ? Math.round((totalGoalsCur / totalGoalsTgt) * 100) : 0}% completado
              </p>
            </div>
          )}

          {loadingG ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : goals.length === 0 ? (
            <div className="zoho-card border-0 p-8 text-center text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No tienes metas de ahorro</p>
              <p className="text-xs mt-1">Crea tu primera meta: fondo de emergencia, viaje, inversión…</p>
              <button
                type="button"
                onClick={() => { setEditGoal(undefined); setShowGoalModal(true) }}
                className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold"
              >
                + Crear meta
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal) => {
                const isComplete = goal.progress_pct >= 100
                return (
                  <div key={goal.goal_id}
                    className={cn(
                      "bg-white rounded-2xl px-5 py-4 shadow-sm border",
                      isComplete ? "border-green-300" : "border-border/50"
                    )}>
                    <div className="flex items-start gap-4">
                      <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: goal.color + "20" }}>
                        <GoalIconComp name={goal.icon} color={goal.color} size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold">{goal.name}</p>
                          {isComplete && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✓ Completada</span>
                          )}
                        </div>
                        {goal.deadline && (
                          <p className="text-xs text-muted-foreground">
                            Fecha límite: {new Date(goal.deadline).toLocaleDateString("es-PA", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                        <div className="mt-3 space-y-1.5">
                          <ProgressBar pct={goal.progress_pct} color={isComplete ? "#16A34A" : goal.color} />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-semibold text-foreground">{formatCurrency(goal.current_amount)}</span> ahorrado
                            </span>
                            <span className="text-muted-foreground">
                              Meta: <span className="font-semibold">{formatCurrency(goal.target_amount)}</span>
                              {" "}· <span style={{ color: goal.color }} className="font-bold">{goal.progress_pct}%</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-border/30">
                      <button type="button"
                        onClick={() => setDepositGoal(goal)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" /> Actualizar saldo
                      </button>
                      <button type="button"
                        onClick={() => { setEditGoal(goal); setShowGoalModal(true) }}
                        className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button"
                        onClick={() => handleDeleteGoal(goal.goal_id)}
                        disabled={deletingGId === goal.goal_id}
                        className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                        {deletingGId === goal.goal_id
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
        </ProGate>
      )}

      {/* ── Modals ── */}
      {showWalletModal && (
        <WalletModal
          initial={editWallet}
          onSave={handleSaveWallet}
          onClose={() => { setShowWalletModal(false); setEditWallet(undefined) }}
        />
      )}
      {showGoalModal && (
        <GoalModal
          initial={editGoal}
          onSave={handleSaveGoal}
          onClose={() => { setShowGoalModal(false); setEditGoal(undefined) }}
        />
      )}
      {depositGoal && (
        <DepositModal
          goal={depositGoal}
          onDeposit={handleDeposit}
          onClose={() => setDepositGoal(undefined)}
        />
      )}
    </div>
  )
}
