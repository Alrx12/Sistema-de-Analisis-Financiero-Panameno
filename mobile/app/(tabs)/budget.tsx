/**
 * BudgetScreen — Presupuesto 50/30/20
 * Tema: dark navy
 */
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
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

function BucketBar({
  emoji, label, actual, target, color, amount,
}: { emoji: string; label: string; actual: number; target: number; color: string; amount: number }) {
  const pct  = Math.min(actual, 100)
  const over = actual > target

  return (
    <View style={styles.bucketCard}>
      <View style={styles.bucketHeader}>
        <Text style={styles.bucketLabel}>{emoji} {label}</Text>
        <Text style={[styles.bucketPct, { color: over ? "#ef4444" : "#22c55e" }]}>
          {actual.toFixed(1)}%
          <Text style={styles.bucketTarget}> / meta {target}%</Text>
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        <View style={[styles.barGoalLine, { left: `${target}%` as `${number}%` }]} />
      </View>
      <Text style={styles.bucketAmount}>{formatCurrency(amount)}</Text>
    </View>
  )
}

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

  const buckets = { needs: 0, wants: 0, savings: 0, other: 0 }
  for (const [cat, amount] of Object.entries(aggregated.categories)) {
    const bucket = classifyBucket(cat)
    buckets[bucket] += amount
  }

  const income     = aggregated.total_income || 1
  const needsPct   = (buckets.needs / income) * 100
  const wantsPct   = (buckets.wants / income) * 100
  const savingsPct = (aggregated.balance / income) * 100

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Presupuesto 50/30/20</Text>
        <Text style={styles.subtitle}>Ingresos: {formatCurrency(aggregated.total_income)}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BucketBar emoji="🏠" label="Necesidades" actual={needsPct}            target={50} color="#3b82f6" amount={buckets.needs} />
        <BucketBar emoji="🎉" label="Deseos"       actual={wantsPct}            target={30} color="#f59e0b" amount={buckets.wants} />
        <BucketBar emoji="💰" label="Ahorro"        actual={Math.max(0, savingsPct)} target={20} color="#22c55e" amount={Math.max(0, aggregated.balance)} />

        {/* Resumen */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Resumen del período</Text>
          {[
            { label: "Gastos totales",  value: formatCurrency(aggregated.total_expenses), color: "#ef4444" },
            { label: "Transacciones",   value: String(aggregated.total_transactions),     color: TEXT },
            { label: "Balance",         value: formatCurrency(aggregated.balance),         color: aggregated.balance >= 0 ? "#22c55e" : "#ef4444" },
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 22, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },

  content: { padding: 12, gap: 10 },

  bucketCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bucketHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, alignItems: "center" },
  bucketLabel:  { fontSize: 15, fontWeight: "700", color: TEXT },
  bucketPct:    { fontSize: 14, fontWeight: "700" },
  bucketTarget: { fontSize: 12, color: DIM as string, fontWeight: "400" },

  barTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  barFill: { height: "100%", borderRadius: 4 },
  barGoalLine: {
    position: "absolute",
    top: 0, bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  bucketAmount: { color: MUTED, fontSize: 13, marginTop: 8 },

  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle:  { fontWeight: "700", color: MUTED, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryLabel:  { color: MUTED, fontSize: 14 },
  summaryValue:  { fontWeight: "700", color: TEXT, fontSize: 14 },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT,  marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22 },
})
