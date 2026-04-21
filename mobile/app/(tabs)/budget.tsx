/**
 * BudgetScreen — Presupuesto 50/30/20 con selector de período y PieChart
 * Tema: dark navy
 */
import { useState } from "react"
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Dimensions,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { PieChart } from "react-native-gifted-charts"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { classifyBucket } from "@safpro/categories"

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"

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

// ── Bucket bar ─────────────────────────────────────────────────────────────────
function BucketBar({
  emoji, label, actual, target, color, amount, categories,
}: {
  emoji: string; label: string; actual: number; target: number
  color: string; amount: number; categories: { name: string; amount: number }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const pct  = Math.min(actual, 100)
  const over = actual > target

  return (
    <View style={s.bucketCard}>
      <TouchableOpacity style={s.bucketHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.75}>
        <Text style={s.bucketLabel}>{emoji} {label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[s.bucketPct, { color: over ? "#ef4444" : "#22c55e" }]}>
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

// ── Bucket types & meta ────────────────────────────────────────────────────────
type BK = "needs" | "wants" | "savings" | "other"

const BUCKET_META: Record<BK, { label: string; target: number; color: string; emoji: string }> = {
  needs:   { label: "Necesidades",    target: 50, color: "#6366f1", emoji: "🏠" },
  wants:   { label: "Deseos",         target: 30, color: "#f59e0b", emoji: "🎉" },
  savings: { label: "Ahorro / Deuda", target: 20, color: "#10b981", emoji: "🐖" },
  other:   { label: "Sin clasificar", target: 0,  color: "#94a3b8", emoji: "❓" },
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function BudgetScreen() {
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState<number | null>(null)

  const params = selMonth === null ? { year: selYear } : { year: selYear, month: selMonth }

  const {
    data: aggregated,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agg", selYear, selMonth],
    queryFn:  () => getAggregatedSummary(params),
  })

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]

  // ── Budget computation ─────────────────────────────────────────────────────
  const budgetData = (() => {
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

    const income = aggregated.total_income || 1
    const pcts: Record<BK, number> = {
      needs:   (totals.needs   / income) * 100,
      wants:   (totals.wants   / income) * 100,
      savings: Math.max(0, (aggregated.balance / income) * 100),
      other:   (totals.other   / income) * 100,
    }

    return { totals, details, pcts, income, aggregated }
  })()

  // ── Tips ───────────────────────────────────────────────────────────────────
  const tips: { type: "warning" | "success" | "info"; msg: string }[] = []
  if (budgetData) {
    const { pcts } = budgetData
    if (pcts.needs > 60)   tips.push({ type: "warning", msg: `Tus necesidades están en ${pcts.needs.toFixed(0)}%. Considera revisar gastos fijos.` })
    if (pcts.wants > 35)   tips.push({ type: "warning", msg: `Tus deseos superan el 30%. Busca suscripciones o gastos opcionales a reducir.` })
    if (pcts.savings < 10) tips.push({ type: "warning", msg: `Tu tasa de ahorro es ${pcts.savings.toFixed(0)}%. El mínimo recomendado es 10%.` })
    if (pcts.savings >= 20)tips.push({ type: "success", msg: `¡Excelente! Estás ahorrando el ${pcts.savings.toFixed(0)}% de tus ingresos. ¡Sigue así!` })
    if (tips.length === 0) tips.push({ type: "info", msg: "Tu distribución de gastos es razonablemente equilibrada." })
  }

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Presupuesto 50/30/20</Text>
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
                    {/* Goal reference */}
                    <View style={s.goalRef}>
                      <Text style={s.goalRefText}>Objetivo: 50 · 30 · 20</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Bucket bars */}
            <BucketBar
              emoji={BUCKET_META.needs.emoji}
              label={BUCKET_META.needs.label}
              actual={budgetData.pcts.needs}
              target={BUCKET_META.needs.target}
              color={BUCKET_META.needs.color}
              amount={budgetData.totals.needs}
              categories={budgetData.details.needs}
            />
            <BucketBar
              emoji={BUCKET_META.wants.emoji}
              label={BUCKET_META.wants.label}
              actual={budgetData.pcts.wants}
              target={BUCKET_META.wants.target}
              color={BUCKET_META.wants.color}
              amount={budgetData.totals.wants}
              categories={budgetData.details.wants}
            />
            <BucketBar
              emoji={BUCKET_META.savings.emoji}
              label={BUCKET_META.savings.label}
              actual={budgetData.pcts.savings}
              target={BUCKET_META.savings.target}
              color={BUCKET_META.savings.color}
              amount={Math.max(0, budgetData.aggregated.balance)}
              categories={budgetData.details.savings}
            />
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
                { label: "Ingresos totales", value: fmt(budgetData.aggregated.total_income),   color: "#22c55e" },
                { label: "Gastos totales",   value: fmt(budgetData.aggregated.total_expenses), color: "#ef4444" },
                { label: "Transacciones",    value: String(budgetData.aggregated.total_transactions), color: TEXT },
                { label: "Balance / Ahorro", value: fmt(budgetData.aggregated.balance), color: budgetData.aggregated.balance >= 0 ? "#22c55e" : "#ef4444" },
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
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 22, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },

  content: { padding: 12, gap: 10 },

  // Filter pills
  pillRow:      { flexDirection: "row", gap: 8 },
  monthContent: { gap: 8, paddingVertical: 2 },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  pillOn:       { backgroundColor: INDIGO, borderColor: INDIGO },
  pillText:     { color: MUTED, fontSize: 13, fontWeight: "600" },
  pillTextOn:   { color: "#fff" },

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
