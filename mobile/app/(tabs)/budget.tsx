/**
 * BudgetScreen — Presupuesto 50/30/20 personalizado
 * v3: presupuesto ajustado por perfil, modal gastos adicionales,
 *     banner de ajustes activos, manualMonthly integrado
 * Tema: dark navy
 */
import { useState, useMemo, useCallback } from "react"
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, TextInput, Modal,
  Alert, Switch, KeyboardAvoidingView, Platform,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { PieChart } from "react-native-gifted-charts"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { getProfile, updateProfile } from "@safpro/api/users"
import { classifyBucket, BUDGET_CATEGORIES } from "@safpro/categories"
import type { UserProfile, ManualExpense, ExpenseFrequency } from "@safpro/types"

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const GREEN  = "#22c55e"

// ── Helpers ────────────────────────────────────────────────────────────────────
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

function fmt(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return "$" + (abs / 1_000_000).toFixed(1) + "M"
  if (abs >= 1_000)     return "$" + (abs / 1_000).toFixed(1) + "k"
  return "$" + abs.toFixed(0)
}

function toMonthly(amount: number, freq: ExpenseFrequency): number {
  if (freq === "weekly")  return amount * 4.33
  if (freq === "annual")  return amount / 12
  return amount
}

// ── Budget target personalization ──────────────────────────────────────────────
function getAdjustedTargets(profile: UserProfile | undefined) {
  if (!profile) return { needs: 50, wants: 30, savings: 20 }

  let needs = 50, savings = 20

  const deps = profile.dependents_count ?? 0
  if (deps > 0) needs += Math.min(deps * 3, 12)

  if (profile.housing_type === "own") needs -= 5

  const emp = profile.employment_type ?? ""
  if (["self_employed", "business_owner", "employed_variable"].includes(emp)) savings += 5

  if ((profile.monthly_debt_payments ?? 0) > 0) savings += 3

  if (profile.industry === "entretenimiento") savings += 5

  const wants = 100 - needs - savings
  return {
    needs:   Math.max(needs,   30),
    wants:   Math.max(wants,   10),
    savings: Math.max(savings,  5),
  }
}

function getActiveAdjustments(profile: UserProfile): string[] {
  const list: string[] = []
  const deps = profile.dependents_count ?? 0
  if (deps > 0)
    list.push(`${deps} dependiente${deps !== 1 ? "s" : ""} (+${Math.min(deps * 3, 12)}% necesidades)`)
  if (profile.housing_type === "own")
    list.push("Vivienda propia (−5% necesidades)")
  const emp = profile.employment_type ?? ""
  if (["self_employed", "business_owner", "employed_variable"].includes(emp))
    list.push("Ingreso variable (+5% ahorro)")
  if ((profile.monthly_debt_payments ?? 0) > 0)
    list.push(`Deudas $${profile.monthly_debt_payments}/mes (+3% ahorro)`)
  if (profile.industry === "entretenimiento")
    list.push("Industria entretenimiento (+5% ahorro)")
  return list
}

// ── Emoji map ──────────────────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  alimentacion:"🛒", supermercado:"🛒", restaurantes:"🍽️", cafe:"☕",
  transporte:"🚗", gasolina:"⛽", servicios:"💡", agua:"💧", luz:"💡",
  internet:"📶", telefono:"📱", entretenimiento:"🎮", streaming:"📺",
  salud:"🏥", educacion:"📚", alquiler:"🏠", hogar:"🏠",
  tecnologia:"💻", suscripciones:"🔔", mascotas:"🐾", ropa:"👕",
  deporte:"⚽", viajes:"✈️", bares:"🍺", ahorro:"🐖",
  inversion:"📈", deudas:"💳", cargo_financiero:"🏦",
  comisiones:"💰", impuestos:"📋", transferencias:"↔️", otros:"📦",
}

// ── BucketBar ──────────────────────────────────────────────────────────────────
function BucketBar({
  emoji, label, actual, target, color, amount, categories,
}: {
  emoji: string; label: string; actual: number; target: number
  color: string; amount: number; categories: { name: string; amount: number }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const pct  = Math.min(actual, 100)
  const over = actual > target + 2

  return (
    <View style={s.bucketCard}>
      <TouchableOpacity style={s.bucketHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.75}>
        <Text style={s.bucketLabel}>{emoji} {label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[s.bucketPct, { color: over ? "#ef4444" : GREEN }]}>
            {actual.toFixed(1)}%
            <Text style={s.bucketTarget}> / {target}%</Text>
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={DIM} />
        </View>
      </TouchableOpacity>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        <View style={[s.barGoalLine, { left: `${target}%` as `${number}%` }]} />
      </View>
      <Text style={s.bucketAmount}>{fmt(amount)}</Text>

      {expanded && categories.length > 0 && (
        <View style={s.catList}>
          {categories.sort((a, b) => b.amount - a.amount).map(({ name, amount: amt }) => (
            <View key={name} style={s.catRow}>
              <Text style={s.catEmoji}>{CAT_EMOJI[name] ?? "📦"}</Text>
              <Text style={s.catName}>{name.replace(/_/g, " ")}</Text>
              <Text style={s.catAmt}>{fmtK(amt)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── ManualExpensesModal ────────────────────────────────────────────────────────
const FREQ_LABELS: Record<ExpenseFrequency, string> = {
  weekly: "Semanal", monthly: "Mensual", annual: "Anual",
}

function ManualExpensesModal({
  visible, profile, onClose,
}: {
  visible: boolean
  profile: UserProfile | undefined
  onClose: () => void
}) {
  const qc = useQueryClient()

  // Add form state
  const [desc,    setDesc]    = useState("")
  const [amount,  setAmount]  = useState("")
  const [freq,    setFreq]    = useState<ExpenseFrequency>("monthly")
  const [cat,     setCat]     = useState("otros")
  const [adding,  setAdding]  = useState(false)

  const saveMut = useMutation({
    mutationFn: (expenses: ManualExpense[]) =>
      updateProfile({ manual_expenses: expenses }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] })
    },
  })

  const currentExpenses: ManualExpense[] = profile?.manual_expenses ?? []

  function handleAdd() {
    const num = parseFloat(amount)
    if (!desc.trim()) { Alert.alert("Completa la descripción"); return }
    if (isNaN(num) || num <= 0) { Alert.alert("Monto inválido"); return }

    const monthly_amount = toMonthly(num, freq)
    const newExp: ManualExpense = {
      id:             Date.now().toString(),
      description:    desc.trim(),
      amount:         num,
      frequency:      freq,
      monthly_amount,
      category:       cat,
      origins:        ["otro"],
    }
    const updated = [...currentExpenses, newExp]
    saveMut.mutate(updated, {
      onSuccess: () => {
        setDesc(""); setAmount(""); setFreq("monthly"); setCat("otros"); setAdding(false)
      },
    })
  }

  function handleDelete(id: string) {
    Alert.alert("Eliminar gasto", "¿Seguro que quieres eliminar este gasto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive",
        onPress: () => saveMut.mutate(currentExpenses.filter(e => e.id !== id)),
      },
    ])
  }

  const total = currentExpenses.reduce((s, e) => s + (e.monthly_amount ?? 0), 0)

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={ms.overlay}>
          <View style={ms.sheet}>
            {/* Header */}
            <View style={ms.sheetHeader}>
              <Text style={ms.sheetTitle}>Gastos adicionales</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={MUTED} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {/* Info */}
              <View style={ms.infoBox}>
                <Ionicons name="information-circle-outline" size={14} color="#a5b4fc" />
                <Text style={ms.infoText}>
                  Agrega gastos en efectivo u otras cuentas bancarias que no aparecen en tus estados de cuenta subidos.
                </Text>
              </View>

              {/* Total badge */}
              {currentExpenses.length > 0 && (
                <View style={ms.totalBadge}>
                  <Text style={ms.totalLabel}>Total mensual adicional</Text>
                  <Text style={ms.totalValue}>{fmt(total)}</Text>
                </View>
              )}

              {/* Current expenses list */}
              {currentExpenses.length === 0 && !adding ? (
                <View style={ms.emptyBox}>
                  <Text style={ms.emptyText}>No hay gastos adicionales registrados.</Text>
                </View>
              ) : (
                currentExpenses.map(e => (
                  <View key={e.id} style={ms.expRow}>
                    <Text style={ms.expEmoji}>{CAT_EMOJI[e.category] ?? "📦"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={ms.expDesc}>{e.description}</Text>
                      <Text style={ms.expMeta}>
                        {FREQ_LABELS[e.frequency]} · {e.category.replace(/_/g, " ")} · ~{fmt(e.monthly_amount)}/mes
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(e.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Add form */}
              {adding ? (
                <View style={ms.addForm}>
                  <Text style={ms.addFormTitle}>Nuevo gasto</Text>

                  <TextInput
                    style={ms.input}
                    placeholder="Descripción (ej. efectivo comida)"
                    placeholderTextColor={MUTED}
                    value={desc}
                    onChangeText={setDesc}
                  />

                  <View style={ms.rowTwo}>
                    <TextInput
                      style={[ms.input, { flex: 1 }]}
                      placeholder="Monto"
                      placeholderTextColor={MUTED}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                    />
                    <View style={ms.freqGroup}>
                      {(["weekly","monthly","annual"] as ExpenseFrequency[]).map(f => (
                        <TouchableOpacity
                          key={f}
                          style={[ms.freqBtn, freq === f && ms.freqBtnOn]}
                          onPress={() => setFreq(f)}
                        >
                          <Text style={[ms.freqBtnText, freq === f && ms.freqBtnTextOn]}>
                            {FREQ_LABELS[f]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <Text style={ms.fieldLabel}>Categoría</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {BUDGET_CATEGORIES.filter(c => !["ahorro","inversion","transferencias"].includes(c)).map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[ms.catChip, cat === c && ms.catChipOn]}
                        onPress={() => setCat(c)}
                      >
                        <Text style={[ms.catChipText, cat === c && ms.catChipTextOn]}>
                          {CAT_EMOJI[c] ?? "📦"} {c.replace(/_/g, " ")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={ms.addFormBtns}>
                    <TouchableOpacity style={ms.cancelBtn} onPress={() => { setAdding(false); setDesc(""); setAmount("") }}>
                      <Text style={ms.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[ms.saveBtn, saveMut.isPending && { opacity: 0.5 }]}
                      onPress={handleAdd}
                      disabled={saveMut.isPending}
                    >
                      {saveMut.isPending
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={ms.saveBtnText}>Guardar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={ms.addBtn} onPress={() => setAdding(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={INDIGO} />
                  <Text style={ms.addBtnText}>Agregar gasto adicional</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function BudgetScreen() {
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState<number | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)

  const params = selMonth === null ? { year: selYear } : { year: selYear, month: selMonth }

  const {
    data: aggregated, isLoading, refetch, isRefetching,
  } = useQuery({
    queryKey: ["agg", selYear, selMonth],
    queryFn:  () => getAggregatedSummary(params),
  })

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn:  getProfile,
    staleTime: 60_000,
  })

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]

  // ── Adjusted targets ───────────────────────────────────────────────────────
  const adjusted = useMemo(() => getAdjustedTargets(profile), [profile?.profile_id,
    profile?.dependents_count, profile?.housing_type, profile?.employment_type,
    profile?.monthly_debt_payments, profile?.industry])

  const activeAdjustments = useMemo(
    () => profile ? getActiveAdjustments(profile) : [],
    [profile?.profile_id, profile?.dependents_count, profile?.housing_type,
      profile?.employment_type, profile?.monthly_debt_payments, profile?.industry]
  )

  // ── Manual expenses total ──────────────────────────────────────────────────
  const manualMonthly = useMemo(() => {
    if (!profile?.manual_expenses?.length) return 0
    return profile.manual_expenses.reduce((s, e) => s + (e.monthly_amount ?? 0), 0)
  }, [profile?.manual_expenses])

  // ── Dynamic BUCKET_META with adjusted targets ──────────────────────────────
  const BUCKET_META = useMemo(() => ({
    needs:   { label: "Necesidades",    target: adjusted.needs,   color: "#6366f1", emoji: "🏠" },
    wants:   { label: "Deseos",         target: adjusted.wants,   color: "#f59e0b", emoji: "🎉" },
    savings: { label: "Ahorro / Deuda", target: adjusted.savings, color: "#10b981", emoji: "🐖" },
    other:   { label: "Sin clasificar", target: 0,                color: "#94a3b8", emoji: "❓" },
  }), [adjusted.needs, adjusted.wants, adjusted.savings])

  // ── Budget computation ─────────────────────────────────────────────────────
  type BK = "needs" | "wants" | "savings" | "other"

  const budgetData = useMemo(() => {
    if (!aggregated || aggregated.total_income === 0) return null

    const totals: Record<BK, number> = { needs: 0, wants: 0, savings: 0, other: 0 }
    const details: Record<BK, { name: string; amount: number }[]> = {
      needs: [], wants: [], savings: [], other: [],
    }

    for (const [cat, amount] of Object.entries(aggregated.categories)) {
      const bk = (classifyBucket(cat) as BK) ?? "other"
      totals[bk] += amount as number
      details[bk].push({ name: cat, amount: amount as number })
    }

    // Add manual monthly total to expenses (split proportionally into "other" for now)
    if (manualMonthly > 0) {
      totals.other += manualMonthly
      details.other.push({ name: "efectivo y otros", amount: manualMonthly })
    }

    const income  = aggregated.total_income || 1
    const realExp = aggregated.total_expenses + manualMonthly
    const pcts: Record<BK, number> = {
      needs:   (totals.needs   / income) * 100,
      wants:   (totals.wants   / income) * 100,
      savings: Math.max(0, ((aggregated.balance - manualMonthly) / income) * 100),
      other:   (totals.other   / income) * 100,
    }

    return { totals, details, pcts, income, realExp, aggregated }
  }, [aggregated, manualMonthly])

  // ── Tips ───────────────────────────────────────────────────────────────────
  const tips = useMemo(() => {
    const out: { type: "warning" | "success" | "info"; msg: string }[] = []
    if (!budgetData) return out
    const { pcts } = budgetData
    const { needs: tn, wants: tw, savings: ts } = adjusted

    if (pcts.needs > tn + 10)   out.push({ type: "warning", msg: `Tus necesidades están en ${pcts.needs.toFixed(0)}% — tu meta personalizada es ${tn}%.` })
    if (pcts.wants > tw + 5)    out.push({ type: "warning", msg: `Tus deseos superan tu meta de ${tw}% (tienes ${pcts.wants.toFixed(0)}%). Revisa gastos opcionales.` })
    if (pcts.savings < ts - 5)  out.push({ type: "warning", msg: `Tu ahorro es ${pcts.savings.toFixed(0)}% — tu meta personalizada es ${ts}%.` })
    if (pcts.savings >= ts)     out.push({ type: "success", msg: `¡Alcanzaste tu meta de ahorro de ${ts}%! Llevas ${pcts.savings.toFixed(0)}%. ¡Sigue así!` })
    if (manualMonthly > 0)      out.push({ type: "info",    msg: `Incluye ${fmt(manualMonthly)}/mes de gastos adicionales registrados manualmente.` })
    if (out.length === 0)       out.push({ type: "info",    msg: "Tu distribución de gastos es equilibrada con respecto a tus metas personalizadas." })
    return out
  }, [budgetData, adjusted, manualMonthly])

  const tipColors = {
    warning: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#fcd34d", icon: "warning-outline" as const },
    success: { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.3)",  text: "#86efac", icon: "checkmark-circle-outline" as const },
    info:    { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.3)", text: "#a5b4fc", icon: "information-circle-outline" as const },
  }

  // ── PieChart data ──────────────────────────────────────────────────────────
  const pieData = budgetData
    ? (["needs", "wants", "savings"] as BK[])
        .filter(k => budgetData.totals[k] > 0)
        .map(k => ({
          value:  budgetData.totals[k],
          color:  BUCKET_META[k].color,
          _label: BUCKET_META[k].label,
          _pct:   budgetData.pcts[k],
        }))
    : []

  const targetStr = `${adjusted.needs} · ${adjusted.wants} · ${adjusted.savings}`
  const isPersonalized = activeAdjustments.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.title}>Presupuesto {targetStr}</Text>
          <TouchableOpacity
            style={s.manualBtn}
            onPress={() => setShowManualModal(true)}
          >
            <Ionicons name="add-circle-outline" size={16} color={INDIGO} />
            <Text style={s.manualBtnText}>
              {manualMonthly > 0 ? `+${fmtK(manualMonthly)}/mes` : "Gastos extra"}
            </Text>
          </TouchableOpacity>
        </View>
        {budgetData && (
          <Text style={s.subtitle}>Ingresos: {fmt(budgetData.income)}</Text>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />}
        contentContainerStyle={s.content}
      >
        {/* Year filter */}
        <View style={s.pillRow}>
          {years.map(y => (
            <TouchableOpacity key={y} style={[s.pill, selYear === y && s.pillOn]} onPress={() => setSelYear(y)}>
              <Text style={[s.pillText, selYear === y && s.pillTextOn]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Month filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthContent}>
          <TouchableOpacity style={[s.pill, selMonth === null && s.pillOn]} onPress={() => setSelMonth(null)}>
            <Text style={[s.pillText, selMonth === null && s.pillTextOn]}>Todo el año</Text>
          </TouchableOpacity>
          {MONTHS.map((m, i) => (
            <TouchableOpacity key={i} style={[s.pill, selMonth === i + 1 && s.pillOn]} onPress={() => setSelMonth(i + 1)}>
              <Text style={[s.pillText, selMonth === i + 1 && s.pillTextOn]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Personalization banner */}
        {isPersonalized && (
          <View style={s.adjustBanner}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Ionicons name="sparkles" size={14} color={GREEN} />
              <Text style={s.adjustTitle}>Metas personalizadas activas</Text>
            </View>
            {activeAdjustments.map((a, i) => (
              <View key={i} style={s.adjustRow}>
                <View style={s.adjustDot} />
                <Text style={s.adjustText}>{a}</Text>
              </View>
            ))}
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : !budgetData ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🎯</Text>
            <Text style={s.emptyTitle}>Sin datos de presupuesto</Text>
            <Text style={s.emptyText}>Sube un estado de cuenta para ver tu análisis 50/30/20.</Text>
          </View>
        ) : (
          <>
            {/* PieChart distribution */}
            {pieData.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Distribución del gasto</Text>
                <View style={s.pieRow}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={68}
                    innerRadius={40}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ color: MUTED, fontSize: 9, fontWeight: "700" }}>TOTAL</Text>
                        <Text style={{ color: TEXT, fontSize: 12, fontWeight: "800" }}>
                          {fmtK(pieData.reduce((a, d) => a + d.value, 0))}
                        </Text>
                      </View>
                    )}
                  />
                  <View style={{ flex: 1 }}>
                    {pieData.map((d, i) => (
                      <View key={i} style={s.pieLegRow}>
                        <View style={[s.pieDot, { backgroundColor: d.color }]} />
                        <Text style={s.pieLegLabel}>{d._label}</Text>
                        <Text style={[s.pieLegPct, { color: d.color }]}>{d._pct.toFixed(0)}%</Text>
                        <Text style={s.pieLegAmt}>{fmtK(d.value)}</Text>
                      </View>
                    ))}
                    <View style={s.goalRef}>
                      <Text style={s.goalRefText}>Objetivo: {targetStr}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Bucket bars */}
            {(["needs","wants","savings"] as BK[]).map(bk => (
              <BucketBar
                key={bk}
                emoji={BUCKET_META[bk].emoji}
                label={BUCKET_META[bk].label}
                actual={budgetData.pcts[bk]}
                target={BUCKET_META[bk].target}
                color={BUCKET_META[bk].color}
                amount={bk === "savings"
                  ? Math.max(0, budgetData.aggregated.balance - manualMonthly)
                  : budgetData.totals[bk]}
                categories={budgetData.details[bk]}
              />
            ))}

            {budgetData.totals.other > 0 && (
              <BucketBar
                emoji={BUCKET_META.other.emoji}
                label={BUCKET_META.other.label}
                actual={budgetData.pcts.other}
                target={0}
                color={BUCKET_META.other.color}
                amount={budgetData.totals.other}
                categories={budgetData.details.other}
              />
            )}

            {/* Tips */}
            {tips.map((tip, i) => {
              const cfg = tipColors[tip.type]
              return (
                <View key={i} style={[s.tipCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Ionicons name={cfg.icon} size={16} color={cfg.text} style={{ marginTop: 1 }} />
                  <Text style={[s.tipText, { color: cfg.text }]}>{tip.msg}</Text>
                </View>
              )
            })}

            {/* Summary */}
            <View style={s.summaryCard}>
              <Text style={s.sectionLabel}>RESUMEN DEL PERÍODO</Text>
              {[
                { label: "Ingresos totales",      value: fmt(budgetData.aggregated.total_income),   color: GREEN },
                { label: "Gastos bancarios",       value: fmt(budgetData.aggregated.total_expenses), color: "#ef4444" },
                ...(manualMonthly > 0 ? [{ label: "Gastos adicionales", value: fmt(manualMonthly), color: ORANGE }] : []),
                { label: "Transacciones",          value: String(budgetData.aggregated.total_transactions), color: TEXT },
                { label: "Balance / Ahorro real",  value: fmt(budgetData.aggregated.balance - manualMonthly), color: (budgetData.aggregated.balance - manualMonthly) >= 0 ? GREEN : "#ef4444" },
              ].map(({ label, value, color }) => (
                <View key={label} style={s.summaryRow}>
                  <Text style={s.summaryLabel}>{label}</Text>
                  <Text style={[s.summaryValue, { color }]}>{value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Manual expenses modal */}
      <ManualExpensesModal
        visible={showManualModal}
        profile={profile}
        onClose={() => setShowManualModal(false)}
      />
    </SafeAreaView>
  )
}

// ── Main styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 20, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },

  manualBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(99,102,241,0.12)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.25)",
  },
  manualBtnText: { color: INDIGO, fontSize: 12, fontWeight: "600" },

  content: { padding: 12, gap: 10 },

  // Filter pills
  pillRow:      { flexDirection: "row", gap: 8 },
  monthContent: { gap: 8, paddingVertical: 2 },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  pillOn:       { backgroundColor: INDIGO, borderColor: INDIGO },
  pillText:     { color: MUTED, fontSize: 13, fontWeight: "600" },
  pillTextOn:   { color: "#fff" },

  // Adjustments banner
  adjustBanner: {
    backgroundColor: "rgba(34,197,94,0.07)",
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
  },
  adjustTitle: { color: GREEN, fontSize: 13, fontWeight: "700" },
  adjustRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  adjustDot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN },
  adjustText:  { color: MUTED, fontSize: 12, flex: 1 },

  // Chart card
  card:      { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  cardTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 12, letterSpacing: 0.3 },

  // Pie
  pieRow:       { flexDirection: "row", alignItems: "center", gap: 16 },
  pieLegRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  pieDot:       { width: 8, height: 8, borderRadius: 4 },
  pieLegLabel:  { flex: 1, color: MUTED, fontSize: 12 },
  pieLegPct:    { fontSize: 12, fontWeight: "700", marginRight: 4 },
  pieLegAmt:    { color: TEXT, fontSize: 11, fontWeight: "600" },
  goalRef:      { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: BORDER },
  goalRefText:  { color: DIM, fontSize: 11, letterSpacing: 0.3 },

  // Bucket cards
  bucketCard:   { backgroundColor: CARD, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  bucketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  bucketLabel:  { fontSize: 15, fontWeight: "700", color: TEXT },
  bucketPct:    { fontSize: 14, fontWeight: "700" },
  bucketTarget: { fontSize: 12, color: DIM as string, fontWeight: "400" },

  barTrack:     { height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden", position: "relative" },
  barFill:      { height: "100%", borderRadius: 4 },
  barGoalLine:  { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  bucketAmount: { color: MUTED, fontSize: 13, marginTop: 8 },

  catList:  { marginTop: 12, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, gap: 6 },
  catRow:   { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  catEmoji: { fontSize: 14, width: 20 },
  catName:  { color: MUTED, fontSize: 13, textTransform: "capitalize", flex: 1 },
  catAmt:   { color: TEXT,  fontSize: 13, fontWeight: "600" },

  // Tips
  tipCard: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  tipText: { fontSize: 13, lineHeight: 18, flex: 1 },

  // Summary
  summaryCard:  { backgroundColor: CARD, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionLabel: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  summaryRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryLabel: { color: MUTED, fontSize: 14 },
  summaryValue: { fontWeight: "700", color: TEXT, fontSize: 14 },

  // Empty
  empty:      { alignItems: "center", padding: 56 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT,  marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22 },
})

// ── Modal styles ───────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sheetTitle:  { color: TEXT, fontSize: 17, fontWeight: "700" },

  infoBox: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: "rgba(99,102,241,0.08)", borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
  },
  infoText: { color: MUTED, fontSize: 12, lineHeight: 17, flex: 1 },

  totalBadge: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "rgba(34,197,94,0.08)", borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
  },
  totalLabel: { color: MUTED, fontSize: 13 },
  totalValue: { color: GREEN, fontWeight: "700", fontSize: 15 },

  emptyBox:  { padding: 24, alignItems: "center" },
  emptyText: { color: MUTED, fontSize: 13, textAlign: "center" },

  expRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  expEmoji: { fontSize: 20 },
  expDesc:  { color: TEXT, fontSize: 14, fontWeight: "600" },
  expMeta:  { color: MUTED, fontSize: 11, marginTop: 2 },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.3)", borderStyle: "dashed",
  },
  addBtnText: { color: INDIGO, fontSize: 14, fontWeight: "600" },

  addForm: {
    backgroundColor: BG, borderRadius: 12, padding: 16,
    gap: 12, borderWidth: 1, borderColor: BORDER,
  },
  addFormTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },

  input: {
    backgroundColor: CARD, borderRadius: 10, padding: 12,
    color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER,
  },
  rowTwo: { flexDirection: "row", gap: 10 },

  fieldLabel: { color: MUTED, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },

  freqGroup:    { flexDirection: "row", gap: 6, alignItems: "center" },
  freqBtn:      { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  freqBtnOn:    { backgroundColor: INDIGO, borderColor: INDIGO },
  freqBtnText:  { color: MUTED, fontSize: 12 },
  freqBtnTextOn:{ color: "#fff", fontWeight: "600" },

  catChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  catChipOn:   { backgroundColor: "rgba(99,102,241,0.2)", borderColor: INDIGO },
  catChipText: { color: MUTED, fontSize: 12 },
  catChipTextOn:{ color: "#a5b4fc", fontWeight: "600" },

  addFormBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn:   { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: "center" },
  cancelBtnText:{ color: MUTED, fontWeight: "600" },
  saveBtn:     { flex: 1, padding: 12, borderRadius: 10, backgroundColor: INDIGO, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700" },
})
