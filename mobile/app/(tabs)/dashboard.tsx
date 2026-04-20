/**
 * Dashboard — KPIs principales
 * Tema: dark navy — idéntico al web (#070c18 bg, #0d1426 cards)
 */
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { getMe } from "@safpro/api/users"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: color, borderTopWidth: 2 }]}>
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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoChip}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.logoLabel}>SAFPRO</Text>
          </View>
          <Text style={styles.greeting}>Hola, {greeting} 👋</Text>
          <Text style={styles.headerSub}>Tu resumen financiero</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : aggregated ? (
          <>
            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <KpiCard label="INGRESOS"      value={formatCurrency(aggregated.total_income)}    color="#22c55e" />
              <KpiCard label="GASTOS"        value={formatCurrency(aggregated.total_expenses)}  color="#ef4444" />
              <KpiCard label="BALANCE"       value={formatCurrency(aggregated.balance)}          color={aggregated.balance >= 0 ? "#3b82f6" : "#f97316"} />
              <KpiCard label="TRANSACCIONES" value={String(aggregated.total_transactions)}       color="#8b5cf6" />
            </View>

            {/* Top merchants */}
            {aggregated.top_merchants.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Comercios</Text>
                {aggregated.top_merchants.slice(0, 5).map((m) => (
                  <View key={m.name} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.rowAmount}>{formatCurrency(m.amount)}</Text>
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
                    <View key={cat} style={styles.row}>
                      <Text style={styles.rowLabel}>{cat}</Text>
                      <Text style={styles.rowAmountNeutral}>{formatCurrency(amount)}</Text>
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
              Sube tu estado de cuenta en "Subir" o registra gastos manualmente.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },

  // Header
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  logoChip: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  logoText:   { color: "#fff", fontSize: 14, fontWeight: "800" },
  logoLabel:  { color: TEXT, fontSize: 15, fontWeight: "700", letterSpacing: 1.5 },
  greeting:   { color: TEXT,  fontSize: 24, fontWeight: "700" },
  headerSub:  { color: MUTED, fontSize: 14, marginTop: 3 },

  // KPI grid
  kpiGrid: {
    flexDirection: "row", flexWrap: "wrap",
    padding: 12, gap: 10,
  },
  kpiCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    width: "47%",
    borderWidth: 1,
    borderColor: BORDER,
  },
  kpiLabel: { fontSize: 10, color: MUTED, fontWeight: "700", letterSpacing: 1.2 },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 6 },

  // Sections
  section: {
    backgroundColor: CARD,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 12, letterSpacing: 0.3 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowLabel:       { color: MUTED, flex: 1, marginRight: 8, fontSize: 13 },
  rowAmount:      { color: "#ef4444", fontWeight: "700", fontSize: 13 },
  rowAmountNeutral: { color: TEXT, fontWeight: "600", fontSize: 13 },

  // Empty state
  emptyState: { alignItems: "center", padding: 56 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22, fontSize: 14 },
})
