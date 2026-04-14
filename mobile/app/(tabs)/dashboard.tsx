/**
 * Dashboard — KPIs principales
 * Llama al mismo endpoint /analysis/aggregated que el web
 */
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { getMe } from "@safpro/api/users"

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

export default function DashboardScreen() {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })
  const {
    data: aggregated,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
    enabled: !!user,
  })

  const greeting = user?.full_name?.split(" ")[0] ?? "Usuario"

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#e05c19" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Hola, {greeting} 👋</Text>
          <Text style={styles.headerSub}>Tu resumen financiero</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#e05c19" style={{ marginTop: 40 }} size="large" />
        ) : aggregated ? (
          <>
            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <KpiCard
                label="INGRESOS"
                value={formatCurrency(aggregated.total_income)}
                color="#22c55e"
              />
              <KpiCard
                label="GASTOS"
                value={formatCurrency(aggregated.total_expenses)}
                color="#ef4444"
              />
              <KpiCard
                label="BALANCE"
                value={formatCurrency(aggregated.balance)}
                color={aggregated.balance >= 0 ? "#3b82f6" : "#f97316"}
              />
              <KpiCard
                label="TRANSACCIONES"
                value={String(aggregated.total_transactions)}
                color="#8b5cf6"
              />
            </View>

            {/* Top merchants */}
            {aggregated.top_merchants.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Comercios</Text>
                {aggregated.top_merchants.slice(0, 5).map((m) => (
                  <View key={m.name} style={styles.merchantRow}>
                    <Text style={styles.merchantName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.merchantAmount}>{formatCurrency(m.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Categorías */}
            {Object.keys(aggregated.categories).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Por Categoría</Text>
                {Object.entries(aggregated.categories)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([cat, amount]) => (
                    <View key={cat} style={styles.categoryRow}>
                      <Text style={styles.categoryName}>{cat}</Text>
                      <Text style={styles.categoryAmount}>{formatCurrency(amount)}</Text>
                    </View>
                  ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📂</Text>
            <Text style={styles.emptyTitle}>Sin datos aún</Text>
            <Text style={styles.emptyText}>
              Sube tu estado de cuenta en la pestaña "Subir" para ver tu análisis aquí.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f5f7" },
  scroll: { flex: 1 },
  header: {
    backgroundColor: "#1c2b4b",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  greeting: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  headerSub: { color: "#93afd4", fontSize: 14, marginTop: 2 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 10,
  },
  kpiCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    width: "47%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiLabel: { fontSize: 10, color: "#6b7280", fontWeight: "700", letterSpacing: 1 },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  section: {
    backgroundColor: "#ffffff",
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1c2b4b", marginBottom: 12 },
  merchantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  merchantName: { color: "#374151", flex: 1, marginRight: 8 },
  merchantAmount: { color: "#e05c19", fontWeight: "700" },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  categoryName: { color: "#374151", textTransform: "capitalize" },
  categoryAmount: { color: "#374151", fontWeight: "600" },
  emptyState: { alignItems: "center", padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#1c2b4b", marginBottom: 8 },
  emptyText: { color: "#6b7280", textAlign: "center", lineHeight: 22 },
})
