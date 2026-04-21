/**
 * CuentasScreen — Resumen bancario + Billeteras manuales + Metas de ahorro
 * Tema: dark navy
 */
import { useState, useCallback } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Modal,
  Alert, Pressable, KeyboardAvoidingView, Platform,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAggregatedSummary, listAnalysis } from "@safpro/api/analysis"
import { getApiClient } from "@safpro/api/client"
import type { AnalysisSnapshot } from "@safpro/types"

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const GREEN  = "#22c55e"
const RED    = "#ef4444"

// ── Types (inline — not in shared packages) ────────────────────────────────────
interface ManualWallet {
  wallet_id:       string
  name:            string
  wallet_type:     string
  icon:            string
  color:           string
  current_balance: number
  is_default:      boolean
}
interface SavingsGoal {
  goal_id:        string
  name:           string
  icon:           string
  color:          string
  target_amount:  number
  current_amount: number
  progress_pct:   number
  deadline:       string | null
}

// ── API helpers (call direct via shared axios client) ──────────────────────────
const API = () => getApiClient()

async function fetchWallets():                           Promise<ManualWallet[]> { return (await API().get("/wallets")).data }
async function createWallet(d: Partial<ManualWallet>):  Promise<ManualWallet>   { return (await API().post("/wallets", d)).data }
async function patchWallet(id: string, d: Partial<ManualWallet>): Promise<ManualWallet> { return (await API().patch(`/wallets/${id}`, d)).data }
async function deleteWalletApi(id: string):             Promise<void>           { await API().delete(`/wallets/${id}`) }

async function fetchGoals():                                 Promise<SavingsGoal[]> { return (await API().get("/goals")).data }
async function createGoal(d: Partial<SavingsGoal>):          Promise<SavingsGoal>   { return (await API().post("/goals", d)).data }
async function patchGoal(id: string, d: Partial<SavingsGoal>): Promise<SavingsGoal>  { return (await API().patch(`/goals/${id}`, d)).data }
async function depositGoal(id: string, amount: number):      Promise<SavingsGoal>   { return (await API().post(`/goals/${id}/deposit`, { amount })).data }
async function deleteGoalApi(id: string):                    Promise<void>           { await API().delete(`/goals/${id}`) }

// ── Palette for icons/colors ───────────────────────────────────────────────────
const PALETTE = ["#6366f1","#3b82f6","#22c55e","#f59e0b","#ef4444","#8b5cf6","#f97316","#ec4899","#0ea5e9","#6b7280"]

const WALLET_ICON_NAMES: { name: string; label: string; ion: string }[] = [
  { name: "card",     label: "Tarjeta",  ion: "card-outline"      },
  { name: "wallet",   label: "Billetera",ion: "wallet-outline"     },
  { name: "bank",     label: "Banco",    ion: "business-outline"   },
  { name: "phone",    label: "Digital",  ion: "phone-portrait-outline" },
  { name: "cash",     label: "Efectivo", ion: "cash-outline"       },
]
const GOAL_ICON_NAMES: { name: string; ion: string }[] = [
  { name: "star",     ion: "star-outline"       },
  { name: "home",     ion: "home-outline"        },
  { name: "car",      ion: "car-outline"         },
  { name: "plane",    ion: "airplane-outline"    },
  { name: "school",   ion: "school-outline"      },
  { name: "heart",    ion: "heart-outline"       },
  { name: "shield",   ion: "shield-outline"      },
  { name: "trending", ion: "trending-up-outline" },
  { name: "gift",     ion: "gift-outline"        },
  { name: "piggy",    ion: "save-outline"        },
]

function walletIonName(icon: string) {
  return WALLET_ICON_NAMES.find(i => i.name === icon)?.ion ?? "wallet-outline"
}
function goalIonName(icon: string) {
  return GOAL_ICON_NAMES.find(i => i.name === icon)?.ion ?? "star-outline"
}

// ── Formatting ─────────────────────────────────────────────────────────────────
function fmt(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1000) return "$" + (Math.abs(n) / 1000).toFixed(1) + "k"
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={s.pgBg}>
      <View style={[s.pgFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
    </View>
  )
}

// ── Wallet form modal ─────────────────────────────────────────────────────────
function WalletModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: ManualWallet
  onClose: () => void
  onSave:  (d: Partial<ManualWallet>) => void
}) {
  const [name,    setName]    = useState(initial?.name ?? "")
  const [balance, setBalance] = useState(String(initial?.current_balance ?? ""))
  const [icon,    setIcon]    = useState(initial?.icon  ?? "wallet")
  const [color,   setColor]   = useState(initial?.color ?? "#6366f1")
  const [saving,  setSaving]  = useState(false)

  function submit() {
    if (!name.trim()) { Alert.alert("Requerido", "El nombre es obligatorio"); return }
    const bal = parseFloat(balance)
    if (isNaN(bal))  { Alert.alert("Inválido", "El saldo debe ser un número");  return }
    setSaving(true)
    onSave({ name: name.trim(), current_balance: bal, icon, color })
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{initial ? "Editar billetera" : "Nueva billetera"}</Text>

        <Text style={s.fieldLabel}>Nombre</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Mi billetera" placeholderTextColor={DIM} />

        <Text style={s.fieldLabel}>Saldo actual</Text>
        <TextInput style={s.input} value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={DIM} />

        <Text style={s.fieldLabel}>Ícono</Text>
        <View style={s.iconRow}>
          {WALLET_ICON_NAMES.map(ic => (
            <TouchableOpacity
              key={ic.name}
              style={[s.iconPick, icon === ic.name && { borderColor: color, borderWidth: 2 }]}
              onPress={() => setIcon(ic.name)}
            >
              <Ionicons name={ic.ion as any} size={20} color={icon === ic.name ? color : MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Color</Text>
        <View style={s.colorRow}>
          {PALETTE.map(c => (
            <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]} onPress={() => setColor(c)} />
          ))}
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: color }]} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Goal form modal ───────────────────────────────────────────────────────────
function GoalModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: SavingsGoal
  onClose: () => void
  onSave:  (d: Partial<SavingsGoal>) => void
}) {
  const [name,    setName]    = useState(initial?.name ?? "")
  const [target,  setTarget]  = useState(String(initial?.target_amount ?? ""))
  const [icon,    setIcon]    = useState(initial?.icon  ?? "star")
  const [color,   setColor]   = useState(initial?.color ?? "#6366f1")
  const [saving,  setSaving]  = useState(false)

  function submit() {
    if (!name.trim()) { Alert.alert("Requerido", "El nombre es obligatorio"); return }
    const t = parseFloat(target)
    if (isNaN(t) || t <= 0) { Alert.alert("Inválido", "El objetivo debe ser mayor que 0"); return }
    setSaving(true)
    onSave({ name: name.trim(), target_amount: t, icon, color })
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{initial ? "Editar meta" : "Nueva meta de ahorro"}</Text>

        <Text style={s.fieldLabel}>Nombre</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Mi meta" placeholderTextColor={DIM} />

        <Text style={s.fieldLabel}>Objetivo ($)</Text>
        <TextInput style={s.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="1000.00" placeholderTextColor={DIM} />

        <Text style={s.fieldLabel}>Ícono</Text>
        <View style={s.iconRow}>
          {GOAL_ICON_NAMES.map(ic => (
            <TouchableOpacity
              key={ic.name}
              style={[s.iconPick, icon === ic.name && { borderColor: color, borderWidth: 2 }]}
              onPress={() => setIcon(ic.name)}
            >
              <Ionicons name={ic.ion as any} size={20} color={icon === ic.name ? color : MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Color</Text>
        <View style={s.colorRow}>
          {PALETTE.map(c => (
            <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]} onPress={() => setColor(c)} />
          ))}
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: color }]} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Deposit modal ─────────────────────────────────────────────────────────────
function DepositModal({
  goal,
  onClose,
  onDeposit,
}: {
  goal:      SavingsGoal
  onClose:   () => void
  onDeposit: (amount: number) => void
}) {
  const [amount, setAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const remaining = goal.target_amount - goal.current_amount

  function submit() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { Alert.alert("Inválido", "El monto debe ser mayor que 0"); return }
    setSaving(true)
    onDeposit(n)
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.sheet}>
        <View style={s.sheetHandle} />
        <View style={[s.goalIconBig, { backgroundColor: goal.color + "20" }]}>
          <Ionicons name={goalIonName(goal.icon) as any} size={28} color={goal.color} />
        </View>
        <Text style={s.sheetTitle}>Depositar a "{goal.name}"</Text>
        <Text style={s.sheetSub}>
          Faltan {fmt(remaining)} para completar la meta
        </Text>

        <Text style={s.fieldLabel}>Monto a depositar</Text>
        <TextInput
          style={s.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={DIM}
          autoFocus
        />

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: goal.color }]} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Confirmar depósito</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
type Tab = "resumen" | "billeteras" | "metas"

export default function CuentasScreen() {
  const router       = useRouter()
  const qc           = useQueryClient()
  const [tab, setTab] = useState<Tab>("resumen")
  const [selectedBank, setSelectedBank] = useState<string | null>(null)

  // ── Resumen queries ─────────────────────────────────────────────────────────
  const { data: snapshots, isLoading: loadingSnaps, refetch: refetchSnaps, isRefetching } = useQuery({
    queryKey: ["analysis"],
    queryFn:  listAnalysis,
  })

  // ── Wallets queries ─────────────────────────────────────────────────────────
  const { data: wallets, isLoading: loadingWallets, refetch: refetchWallets } = useQuery({
    queryKey: ["wallets"],
    queryFn:  fetchWallets,
  })

  // ── Goals queries ───────────────────────────────────────────────────────────
  const { data: goals, isLoading: loadingGoals, refetch: refetchGoals } = useQuery({
    queryKey: ["goals"],
    queryFn:  fetchGoals,
  })

  // ── Wallet mutations ────────────────────────────────────────────────────────
  const [walletModal, setWalletModal] = useState<{ open: boolean; item?: ManualWallet }>({ open: false })

  const mutCreateWallet = useMutation({
    mutationFn: createWallet,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["wallets"] }); setWalletModal({ open: false }) },
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo guardar"),
  })
  const mutUpdateWallet = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<ManualWallet> }) => patchWallet(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["wallets"] }); setWalletModal({ open: false }) },
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo guardar"),
  })
  const mutDeleteWallet = useMutation({
    mutationFn: deleteWalletApi,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["wallets"] }),
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo eliminar"),
  })

  function saveWallet(d: Partial<ManualWallet>) {
    if (walletModal.item) {
      mutUpdateWallet.mutate({ id: walletModal.item.wallet_id, d })
    } else {
      mutCreateWallet.mutate(d)
    }
  }
  function confirmDeleteWallet(w: ManualWallet) {
    Alert.alert("Eliminar billetera", `¿Eliminar "${w.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => mutDeleteWallet.mutate(w.wallet_id) },
    ])
  }

  // ── Goal mutations ──────────────────────────────────────────────────────────
  const [goalModal,    setGoalModal]    = useState<{ open: boolean; item?: SavingsGoal }>({ open: false })
  const [depositModal, setDepositModal] = useState<SavingsGoal | null>(null)

  const mutCreateGoal = useMutation({
    mutationFn: createGoal,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["goals"] }); setGoalModal({ open: false }) },
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo guardar"),
  })
  const mutUpdateGoal = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<SavingsGoal> }) => patchGoal(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["goals"] }); setGoalModal({ open: false }) },
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo guardar"),
  })
  const mutDepositGoal = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => depositGoal(id, amount),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["goals"] }); setDepositModal(null) },
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo depositar"),
  })
  const mutDeleteGoal = useMutation({
    mutationFn: deleteGoalApi,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["goals"] }),
    onError:    (e: any) => Alert.alert("Error", e?.response?.data?.detail ?? "No se pudo eliminar"),
  })

  function saveGoal(d: Partial<SavingsGoal>) {
    if (goalModal.item) {
      mutUpdateGoal.mutate({ id: goalModal.item.goal_id, d })
    } else {
      mutCreateGoal.mutate(d)
    }
  }
  function confirmDeleteGoal(g: SavingsGoal) {
    Alert.alert("Eliminar meta", `¿Eliminar "${g.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => mutDeleteGoal.mutate(g.goal_id) },
    ])
  }

  // ── Resumen derived data ────────────────────────────────────────────────────
  const banks = snapshots
    ? [...new Map(
        (snapshots as AnalysisSnapshot[])
          .filter(s => !!s.bank_account)
          .map(s => [s.bank_account!.account_last4, {
            key:   s.bank_account!.account_last4 ?? "??",
            name:  s.bank_account!.bank_name,
            last4: s.bank_account!.account_last4,
          }])
      ).values()]
    : []

  const filteredSnaps: AnalysisSnapshot[] = selectedBank
    ? (snapshots ?? []).filter((s: AnalysisSnapshot) => s.bank_account?.account_last4 === selectedBank)
    : (snapshots ?? [])

  const filtIncome   = filteredSnaps.reduce((a, s) => a + s.total_income, 0)
  const filtExpenses = filteredSnaps.reduce((a, s) => a + s.total_expenses, 0)
  const filtBalance  = filtIncome - filtExpenses
  const filtTxs      = filteredSnaps.reduce((a, s) => a + s.total_transactions, 0)

  const totalInGoals = (goals ?? []).reduce((a: number, g: SavingsGoal) => a + g.current_amount, 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Cuentas</Text>
        <TouchableOpacity style={s.uploadBtn} onPress={() => router.push("/(tabs)/upload")} activeOpacity={0.8}>
          <Ionicons name="cloud-upload-outline" size={14} color={TEXT} />
          <Text style={s.uploadBtnText}>Subir</Text>
        </TouchableOpacity>
      </View>

      {/* Tab pills */}
      <View style={s.tabRow}>
        {(["resumen","billeteras","metas"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextOn]}>
              {t === "resumen" ? "Resumen" : t === "billeteras" ? "Billeteras" : "Metas"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TAB: RESUMEN ── */}
      {tab === "resumen" && (
        <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchSnaps} tintColor={INDIGO} />}>
          {loadingSnaps ? (
            <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
          ) : !snapshots?.length ? (
            <View style={s.empty}>
              <Ionicons name="wallet-outline" size={52} color={MUTED} style={{ marginBottom: 16 }} />
              <Text style={s.emptyTitle}>Sin estados de cuenta</Text>
              <Text style={s.emptyText}>Sube un estado de cuenta bancario para ver tu resumen aquí.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(tabs)/upload")}>
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={s.emptyBtnText}>Subir estado de cuenta</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Bank chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bankScroll}>
                <TouchableOpacity style={[s.bankChip, selectedBank === null && s.bankChipOn]} onPress={() => setSelectedBank(null)}>
                  <Ionicons name="layers-outline" size={12} color={selectedBank === null ? INDIGO : MUTED} style={{ marginRight: 4 }} />
                  <Text style={[s.bankChipText, selectedBank === null && s.bankChipTextOn]}>Consolidado ({banks.length})</Text>
                </TouchableOpacity>
                {banks.map(b => (
                  <TouchableOpacity key={b.key} style={[s.bankChip, selectedBank === b.key && s.bankChipOn]} onPress={() => setSelectedBank(b.key)}>
                    <Ionicons name="business-outline" size={12} color={selectedBank === b.key ? INDIGO : MUTED} style={{ marginRight: 4 }} />
                    <Text style={[s.bankChipText, selectedBank === b.key && s.bankChipTextOn]}>{b.name} ····{b.last4}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* KPIs */}
              <View style={s.kpiGrid}>
                <View style={[s.kpiCard, { borderTopColor: GREEN }]}>
                  <Text style={s.kpiLabel}>INGRESOS</Text>
                  <Text style={[s.kpiValue, { color: GREEN }]}>{fmt(filtIncome)}</Text>
                </View>
                <View style={[s.kpiCard, { borderTopColor: RED }]}>
                  <Text style={s.kpiLabel}>GASTOS</Text>
                  <Text style={[s.kpiValue, { color: RED }]}>{fmt(filtExpenses)}</Text>
                </View>
                <View style={[s.kpiCard, { borderTopColor: filtBalance >= 0 ? "#3b82f6" : "#f97316" }]}>
                  <Text style={s.kpiLabel}>BALANCE</Text>
                  <Text style={[s.kpiValue, { color: filtBalance >= 0 ? "#3b82f6" : "#f97316" }]}>{fmt(filtBalance)}</Text>
                </View>
                <View style={[s.kpiCard, { borderTopColor: "#8b5cf6" }]}>
                  <Text style={s.kpiLabel}>TRANSACCIONES</Text>
                  <Text style={[s.kpiValue, { color: "#8b5cf6" }]}>{filtTxs}</Text>
                </View>
              </View>

              {/* Snapshots list */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Estados de cuenta subidos</Text>
                {filteredSnaps.slice(0, 8).map(snap => (
                  <View key={snap.snapshot_id} style={s.snapRow}>
                    <View style={s.snapIcon}>
                      <Ionicons name="document-text-outline" size={16} color={INDIGO} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.snapBank} numberOfLines={1}>
                        {snap.bank_account ? `${snap.bank_account.bank_name} ····${snap.bank_account.account_last4}` : "Sin banco"}
                      </Text>
                      <Text style={s.snapPeriod}>
                        {snap.period_start ? new Date(snap.period_start).toLocaleDateString("es-PA", { month: "short", year: "numeric" }) : "—"}
                        {" — "}
                        {snap.period_end ? new Date(snap.period_end).toLocaleDateString("es-PA", { month: "short", year: "numeric" }) : "—"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.snapBalance, { color: snap.balance >= 0 ? GREEN : RED }]}>{fmt(snap.balance, true)}</Text>
                      <Text style={s.snapTxs}>{snap.total_transactions} txs</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── TAB: BILLETERAS ── */}
      {tab === "billeteras" && (
        <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={refetchWallets} tintColor={INDIGO} />}>
          {loadingWallets ? (
            <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
          ) : (
            <>
              {/* Summary row */}
              {wallets && wallets.length > 0 && (
                <View style={s.sumRow}>
                  <View style={s.sumItem}>
                    <Text style={s.sumLabel}>TOTAL EN BILLETERAS</Text>
                    <Text style={[s.sumValue, { color: GREEN }]}>
                      {fmt(wallets.reduce((a: number, w: ManualWallet) => a + w.current_balance, 0))}
                    </Text>
                  </View>
                  <View style={s.sumDivider} />
                  <View style={s.sumItem}>
                    <Text style={s.sumLabel}>BILLETERAS</Text>
                    <Text style={[s.sumValue, { color: INDIGO }]}>{wallets.length}</Text>
                  </View>
                </View>
              )}

              {/* Wallet cards */}
              <View style={s.listContainer}>
                {(wallets ?? []).map((w: ManualWallet) => (
                  <View key={w.wallet_id} style={s.walletCard}>
                    <View style={[s.walletIconBox, { backgroundColor: w.color + "20" }]}>
                      <Ionicons name={walletIonName(w.icon) as any} size={22} color={w.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.walletName}>{w.name}</Text>
                      <Text style={s.walletType}>{w.wallet_type}</Text>
                    </View>
                    <Text style={[s.walletBalance, { color: w.current_balance >= 0 ? GREEN : RED }]}>
                      {fmt(w.current_balance)}
                    </Text>
                    <View style={s.cardActions}>
                      <TouchableOpacity style={s.iconBtn} onPress={() => setWalletModal({ open: true, item: w })}>
                        <Ionicons name="pencil-outline" size={16} color={MUTED} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.iconBtn} onPress={() => confirmDeleteWallet(w)}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {!wallets?.length && (
                  <View style={s.empty}>
                    <Ionicons name="wallet-outline" size={48} color={MUTED} style={{ marginBottom: 12 }} />
                    <Text style={s.emptyTitle}>Sin billeteras</Text>
                    <Text style={s.emptyText}>Agrega una billetera para llevar el control de tu efectivo y tarjetas.</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* FAB */}
          <TouchableOpacity style={s.fab} onPress={() => setWalletModal({ open: true })}>
            <Ionicons name="add" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── TAB: METAS ── */}
      {tab === "metas" && (
        <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={refetchGoals} tintColor={INDIGO} />}>
          {loadingGoals ? (
            <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
          ) : (
            <>
              {/* Summary row */}
              {goals && goals.length > 0 && (
                <View style={s.sumRow}>
                  <View style={s.sumItem}>
                    <Text style={s.sumLabel}>AHORRADO EN METAS</Text>
                    <Text style={[s.sumValue, { color: GREEN }]}>{fmt(totalInGoals)}</Text>
                  </View>
                  <View style={s.sumDivider} />
                  <View style={s.sumItem}>
                    <Text style={s.sumLabel}>METAS ACTIVAS</Text>
                    <Text style={[s.sumValue, { color: INDIGO }]}>{goals.length}</Text>
                  </View>
                </View>
              )}

              {/* Goal cards */}
              <View style={s.listContainer}>
                {(goals ?? []).map((g: SavingsGoal) => {
                  const pct = g.progress_pct ?? (g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0)
                  return (
                    <View key={g.goal_id} style={s.goalCard}>
                      <View style={s.goalCardTop}>
                        <View style={[s.goalIconBox, { backgroundColor: g.color + "20" }]}>
                          <Ionicons name={goalIonName(g.icon) as any} size={22} color={g.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.goalName}>{g.name}</Text>
                          {g.deadline && (
                            <Text style={s.goalDeadline}>
                              Fecha límite: {new Date(g.deadline).toLocaleDateString("es-PA", { month: "short", day: "numeric", year: "numeric" })}
                            </Text>
                          )}
                        </View>
                        <View style={s.cardActions}>
                          <TouchableOpacity style={s.iconBtn} onPress={() => setGoalModal({ open: true, item: g })}>
                            <Ionicons name="pencil-outline" size={16} color={MUTED} />
                          </TouchableOpacity>
                          <TouchableOpacity style={s.iconBtn} onPress={() => confirmDeleteGoal(g)}>
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={s.goalAmounts}>
                        <Text style={[s.goalCurrent, { color: g.color }]}>{fmt(g.current_amount)}</Text>
                        <Text style={s.goalOf}> / {fmt(g.target_amount)}</Text>
                        <Text style={[s.goalPct, { color: g.color }]}>{Math.round(pct)}%</Text>
                      </View>

                      <ProgressBar pct={pct} color={g.color} />

                      <TouchableOpacity
                        style={[s.depositBtn, { borderColor: g.color + "60" }]}
                        onPress={() => setDepositModal(g)}
                      >
                        <Ionicons name="add-circle-outline" size={15} color={g.color} />
                        <Text style={[s.depositBtnText, { color: g.color }]}>Depositar</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}

                {!goals?.length && (
                  <View style={s.empty}>
                    <Ionicons name="flag-outline" size={48} color={MUTED} style={{ marginBottom: 12 }} />
                    <Text style={s.emptyTitle}>Sin metas de ahorro</Text>
                    <Text style={s.emptyText}>Crea tu primera meta para empezar a ahorrar con propósito.</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* FAB */}
          <TouchableOpacity style={s.fab} onPress={() => setGoalModal({ open: true })}>
            <Ionicons name="add" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── Modals ── */}
      {walletModal.open && (
        <WalletModal
          initial={walletModal.item}
          onClose={() => setWalletModal({ open: false })}
          onSave={saveWallet}
        />
      )}
      {goalModal.open && (
        <GoalModal
          initial={goalModal.item}
          onClose={() => setGoalModal({ open: false })}
          onSave={saveGoal}
        />
      )}
      {depositModal && (
        <DepositModal
          goal={depositModal}
          onClose={() => setDepositModal(null)}
          onDeposit={(amount) => mutDepositGoal.mutate({ id: depositModal.goal_id, amount })}
        />
      )}
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  title:       { color: TEXT,  fontSize: 20, fontWeight: "700" },
  uploadBtn:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: INDIGO, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  uploadBtnText: { color: TEXT, fontSize: 13, fontWeight: "600" },

  // Tabs
  tabRow: { flexDirection: "row", backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabBtnOn: { borderBottomWidth: 2, borderBottomColor: INDIGO },
  tabText:  { color: MUTED, fontSize: 13, fontWeight: "600" },
  tabTextOn: { color: TEXT },

  // Bank filter
  bankScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  bankChip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bankChipOn:      { backgroundColor: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.35)" },
  bankChipText:    { color: MUTED, fontSize: 12, fontWeight: "600" },
  bankChipTextOn:  { color: "#a5b4fc" },

  // KPI grid (resumen tab)
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 4, gap: 10, marginBottom: 4 },
  kpiCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    width: "47%", borderWidth: 1, borderColor: BORDER, borderTopWidth: 2,
  },
  kpiLabel: { fontSize: 10, color: MUTED, fontWeight: "700", letterSpacing: 1.2 },
  kpiValue: { fontSize: 17, fontWeight: "800", marginTop: 5 },

  // Snapshots
  section: { backgroundColor: CARD, margin: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  snapRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  snapIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(99,102,241,0.12)", alignItems: "center", justifyContent: "center" },
  snapBank:    { color: TEXT,  fontSize: 13, fontWeight: "600" },
  snapPeriod:  { color: MUTED, fontSize: 11, marginTop: 1 },
  snapBalance: { fontSize: 14, fontWeight: "700" },
  snapTxs:     { color: DIM, fontSize: 11 },

  // Summary row (wallets/goals)
  sumRow: {
    flexDirection: "row", backgroundColor: CARD,
    margin: 12, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  sumItem:    { flex: 1, alignItems: "center" },
  sumDivider: { width: 1, backgroundColor: BORDER },
  sumLabel:   { fontSize: 10, color: MUTED, fontWeight: "700", letterSpacing: 1 },
  sumValue:   { fontSize: 18, fontWeight: "800", marginTop: 5 },

  // Lists
  listContainer: { paddingHorizontal: 12, gap: 10 },

  // Wallet card
  walletCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  walletIconBox: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  walletName:    { color: TEXT,  fontSize: 14, fontWeight: "600" },
  walletType:    { color: MUTED, fontSize: 12, marginTop: 1 },
  walletBalance: { fontSize: 15, fontWeight: "700" },

  // Goal card
  goalCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  goalCardTop:  { flexDirection: "row", alignItems: "center", gap: 12 },
  goalIconBox:  { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  goalName:     { color: TEXT,  fontSize: 14, fontWeight: "600" },
  goalDeadline: { color: MUTED, fontSize: 11, marginTop: 2 },
  goalAmounts:  { flexDirection: "row", alignItems: "baseline" },
  goalCurrent:  { fontSize: 18, fontWeight: "800" },
  goalOf:       { color: MUTED, fontSize: 13 },
  goalPct:      { marginLeft: "auto" as any, fontSize: 14, fontWeight: "700" },

  // Progress bar
  pgBg:   { height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" },
  pgFill: { height: "100%", borderRadius: 4 },

  // Deposit button
  depositBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderRadius: 8, paddingVertical: 8,
  },
  depositBtnText: { fontSize: 13, fontWeight: "600" },

  // Card actions (edit/delete)
  cardActions: { flexDirection: "row", gap: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },

  // FAB
  fab: {
    position: "absolute", bottom: 80, right: 20,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: INDIGO, alignItems: "center", justifyContent: "center",
    shadowColor: INDIGO, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 8,
  },

  // Modal / bottom sheet
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#0f1a30",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
    gap: 4,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginBottom: 16,
  },
  sheetTitle: { color: TEXT,  fontSize: 18, fontWeight: "700", marginBottom: 4 },
  sheetSub:   { color: MUTED, fontSize: 13, marginBottom: 12 },
  fieldLabel: { color: MUTED, fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: "#182035", borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: TEXT, fontSize: 15,
  },
  iconRow:  { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  iconPick: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  colorRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { transform: [{ scale: 1.25 }], borderWidth: 2, borderColor: "#fff" },
  saveBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Goal icon (deposit modal)
  goalIconBig: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 8 },

  // Empty state
  empty:       { alignItems: "center", padding: 48 },
  emptyTitle:  { color: TEXT,  fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyText:   { color: MUTED, textAlign: "center", lineHeight: 22, fontSize: 14, marginBottom: 24 },
  emptyBtn:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: INDIGO, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText:{ color: "#fff", fontWeight: "700", fontSize: 14 },
})
