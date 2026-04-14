/**
 * BudgetScreen — Presupuesto 50/30/20 simplificado para mobile
 * Llama a /analysis/aggregated igual que el web
 */
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { classifyBucket } from "@safpro/categories"

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 })
}

function BucketBar({
  label, actual, target, color, amount
}: { label: string; actual: number; target: number; color: string; amount: number }) {
  const pct = Math.min(actual, 100)
  const over = actual > target

  return (
    <View style={styles.bucketCard}>
      <View style={styles.bucketHeader}>
        <Text style={styles.bucketLabel}>{label}</Text>
        <Text style={[styles.bucketPct, { color: over ? "#ef4444" : "#22c55e" }]}>
          {actual.toFixed(1)}% <Text style={styles.bucketTarget}>/ meta {target}%</Text>
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        {/* Línea de meta */}
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
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#e05c19" style={{ marginTop: 80 }} size="large" />
      </SafeAreaView>
    )
  }

  if (!aggregated || aggregated.total_income === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>Sin datos de presupuesto</Text>
          <Text style={styles.emptyText}>Sube un estado de cuenta para ver tu 50/30/20.</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Agrupar categorías en buckets
  const buckets = { needs: 0, wants: 0, savings: 0, other: 0 }
  for (const [cat, amount] of Object.entries(aggregated.categories)) {
    const bucket = classifyBucket(cat)
    buckets[bucket] += amount
  }

  const total = aggregated.total_expenses || 1
  const income = aggregated.total_income || 1

  const needsPct = (buckets.needs / income) * 100
  const wantsPct = (buckets.wants / income) * 100
  const savingsPct = (aggregated.balance / income) * 100

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Presupuesto 50/30/20</Text>
          <Text style={styles.subtitle}>Ingresos: {formatCurrency(aggregated.total_income)}</Text>
        </View>

        <View style={styles.content}>
          <BucketBar
            label="🏠 Necesidades"
            actual={needsPct}
            target={50}
            color="#3b82f6"
            amount={buckets.needs}
          />
          <BucketBar
            label="🎉 Deseos"
            actual={wantsPct}
            target={30}
            color="#f59e0b"
            amount={buckets.wants}
          />
          <BucketBar
            label="💰 Ahorro"
            actual={Math.max(0, savingsPct)}
            target={20}
            color="#22c55e"
            amount={Math.max(0, aggregated.balance)}
          />

          {/* Resumen */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen del período</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gastos totales</Text>
              <Text style={styles.summaryValue}>{formatCurrency(aggregated.total_expenses)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Transacciones</Text>
              <Text style={styles.summaryValue}>{aggregated.total_transactions}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Balance</Text>
              <Text style={[styles.summaryValue, {
                color: aggregated.balance >= 0 ? "#22c55e" : "#ef4444"
              }]}>
                {formatCurrency(aggregated.balance)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f5f7" },
  header: {
    backgroundColor: "#1c2b4b",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#93afd4", fontSize: 13, marginTop: 2 },
  content: { padding: 12 },
  bucketCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bucketHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  bucketLabel: { fontSize: 15, fontWeight: "700", color: "#1c2b4b" },
  bucketPct: { fontSize: 14, fontWeight: "700" },
  bucketTarget: { fontSize: 12, color: "#9ca3af", fontWeight: "400" },
  barTrack: {
    height: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 5,
    overflow: "hidden",
    position: "relative",
  },
  barFill: { height: "100%", borderRadius: 5 },
  barGoalLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#374151",
  },
  bucketAmount: { color: "#6b7280", fontSize: 13, marginTop: 8 },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: { fontWeight: "700", color: "#1c2b4b", marginBottom: 12, fontSize: 15 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  summaryLabel: { color: "#6b7280" },
  summaryValue: { fontWeight: "700", color: "#1c2b4b" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#1c2b4b", marginBottom: 8 },
  emptyText: { color: "#6b7280", textAlign: "center", lineHeight: 22 },
})
