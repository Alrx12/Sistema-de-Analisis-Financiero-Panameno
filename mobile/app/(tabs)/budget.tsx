/**
 * BudgetScreen — Presupuesto 50/30/20
 * Con desglose de categorías por cubeta y recomendaciones
 * Tema: dark navy
 */
import { useState } from "react"
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { classifyBucket } from "@safpro/categories"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 })
}

// ── Emojis por categoría ──────────────────────────────────────────────────────
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

// ── Bucket bar con desglose expandible ───────────────────────────────────────
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
    <View style={styles.bucketCard}>
      {/* Header row */}
      <TouchableOpacity
        style={styles.bucketHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.75}
      >
        <Text style={styles.bucketLabel}>{emoji} {label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.bucketPct, { color: over ? "#ef4444" : "#22c55e" }]}>
            {actual.toFixed(1)}%
            <Text style={styles.bucketTarget}> / {target}%</Text>
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={DIM}
          />
        </View>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        <View style={[styles.barGoalLine, { left: `${target}%` as `${number}%` }]} />
      </View>
      <Text style={styles.bucketAmount}>{formatCurrency(amount)}</Text>

      {/* Categorías expandidas */}
      {expanded && categories.length > 0 && (
        <View style={styles.catList}>
          {categories
            .sort((a, b) => b.amount - a.amount)
            .map(({ name, amount: catAmt }) => (
              <View key={name} style={styles.catRow}>
                <Text style={styles.catEmoji}>{CAT_EMOJI[name] ?? "📦"}</Text>
                <Text style={styles.catName}>{name.replace(/_/g, " ")}</Text>
                <Text style={styles.catAmt}>{formatCurrency(catAmt)}</Text>
              </View>
            ))}
        </View>
      )}
    </View>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function BudgetScreen() {
  const { data: aggregated, isLoading } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
  })

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ActivityIndicator color={INDIGO} style={{ marginTop: 80 }} size="large" />
      </SafeAreaView>
    )
  }

  if (!aggregated || aggregated.total_income === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Presupuesto 50/30/20</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>Sin datos de presupuesto</Text>
          <Text style={styles.emptyText}>Sube un estado de cuenta para ver tu 50/30/20.</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Clasificar categorías en cubetas con detalle
  const bucketDetails: Record<"needs"|"wants"|"savings"|"other", { name: string; amount: number }[]> = {
    needs: [], wants: [], savings: [], other: [],
  }
  const bucketTotals = { needs: 0, wants: 0, savings: 0, other: 0 }

  for (const [cat, amount] of Object.entries(aggregated.categories)) {
    const bucket = classifyBucket(cat) as "needs"|"wants"|"savings"|"other"
    bucketTotals[bucket] += amount
    bucketDetails[bucket].push({ name: cat, amount })
  }

  const income     = aggregated.total_income || 1
  const needsPct   = (bucketTotals.needs   / income) * 100
  const wantsPct   = (bucketTotals.wants   / income) * 100
  const savingsPct = (aggregated.balance   / income) * 100

  // Tips automáticos
  const tips: { type: "warning"|"success"|"info"; msg: string }[] = []
  if (needsPct > 60)  tips.push({ type: "warning", msg: `Tus necesidades están en ${needsPct.toFixed(0)}%. Considera revisar gastos fijos.` })
  if (wantsPct > 35)  tips.push({ type: "warning", msg: `Tus deseos superan el 30%. Identifica suscripciones o gastos opcionales a reducir.` })
  if (savingsPct < 10) tips.push({ type: "warning", msg: `Tu tasa de ahorro es ${savingsPct.toFixed(0)}%. El objetivo mínimo recomendado es 10%.` })
  if (savingsPct >= 20) tips.push({ type: "success", msg: `¡Excelente! Estás ahorrando el ${savingsPct.toFixed(0)}% de tus ingresos. ¡Sigue así!` })
  if (tips.length === 0) tips.push({ type: "info", msg: "Tu distribución de gastos es razonablemente equilibrada." })

  const tipColors = {
    warning: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#fcd34d", icon: "warning-outline" },
    success: { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.3)",  text: "#86efac", icon: "checkmark-circle-outline" },
    info:    { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.3)", text: "#a5b4fc", icon: "information-circle-outline" },
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Presupuesto 50/30/20</Text>
        <Text style={styles.subtitle}>Ingresos: {formatCurrency(aggregated.total_income)}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Barras */}
        <BucketBar emoji="🏠" label="Necesidades" actual={needsPct}            target={50} color="#3b82f6" amount={bucketTotals.needs}           categories={bucketDetails.needs} />
        <BucketBar emoji="🎉" label="Deseos"       actual={wantsPct}            target={30} color="#f59e0b" amount={bucketTotals.wants}           categories={bucketDetails.wants} />
        <BucketBar emoji="💰" label="Ahorro"        actual={Math.max(0, savingsPct)} target={20} color="#22c55e" amount={Math.max(0, aggregated.balance)} categories={bucketDetails.savings} />

        {/* Tips */}
        {tips.map((tip, i) => {
          const cfg = tipColors[tip.type]
          return (
            <View key={i} style={[styles.tipCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
              <Ionicons name={cfg.icon as any} size={16} color={cfg.text} style={{ marginTop: 1 }} />
              <Text style={[styles.tipText, { color: cfg.text }]}>{tip.msg}</Text>
            </View>
          )
        })}

        {/* Resumen */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Resumen del período</Text>
          {[
            { label: "Ingresos totales",  value: formatCurrency(aggregated.total_income),   color: "#22c55e" },
            { label: "Gastos totales",    value: formatCurrency(aggregated.total_expenses),  color: "#ef4444" },
            { label: "Transacciones",     value: String(aggregated.total_transactions),       color: TEXT },
            { label: "Balance / Ahorro",  value: formatCurrency(aggregated.balance),          color: aggregated.balance >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={[styles.summaryValue, { color }]}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 22, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },

  content: { padding: 12, gap: 10 },

  bucketCard: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  bucketHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  bucketLabel:   { fontSize: 15, fontWeight: "700", color: TEXT },
  bucketPct:     { fontSize: 14, fontWeight: "700" },
  bucketTarget:  { fontSize: 12, color: DIM as string, fontWeight: "400" },

  barTrack: {
    height: 8, backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4, overflow: "hidden", position: "relative",
  },
  barFill:     { height: "100%", borderRadius: 4 },
  barGoalLine: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  bucketAmount:{ color: MUTED, fontSize: 13, marginTop: 8 },

  // Category list
  catList: { marginTop: 12, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, gap: 6 },
  catRow:  { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  catEmoji:{ fontSize: 14, width: 20 },
  catName: { color: MUTED, fontSize: 13, textTransform: "capitalize", flex: 1 },
  catAmt:  { color: TEXT,  fontSize: 13, fontWeight: "600" },

  // Tips
  tipCard:  { flexDirection: "row", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  tipText:  { fontSize: 13, lineHeight: 18, flex: 1 },

  // Summary
  summaryCard:   { backgroundColor: CARD, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle:  { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryLabel:  { color: MUTED, fontSize: 14 },
  summaryValue:  { fontWeight: "700", color: TEXT, fontSize: 14 },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT,  marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22 },
})
