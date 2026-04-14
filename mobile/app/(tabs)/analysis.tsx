/**
 * AnalysisListScreen — historial de snapshots
 */
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { listAnalysis } from "@safpro/api/analysis"
import type { AnalysisSnapshot } from "@safpro/types"

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("es-PA", { month: "short", year: "numeric" })
}

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0 })
}

function SnapshotCard({ item, onPress }: { item: AnalysisSnapshot; onPress: () => void }) {
  const savingsRate = item.total_income > 0
    ? ((item.balance / item.total_income) * 100).toFixed(0)
    : "0"

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardPeriod}>
            {formatDate(item.period_start)} — {formatDate(item.period_end)}
          </Text>
          <Text style={styles.cardBank}>
            {item.bank_account
              ? `${item.bank_account.bank_name} ····${item.bank_account.account_last4 ?? ""}`
              : "Sin cuenta"}
          </Text>
        </View>
        <View style={[styles.savingsBadge, {
          backgroundColor: Number(savingsRate) >= 0 ? "#dcfce7" : "#fee2e2"
        }]}>
          <Text style={[styles.savingsText, {
            color: Number(savingsRate) >= 0 ? "#16a34a" : "#dc2626"
          }]}>
            {savingsRate}% ahorro
          </Text>
        </View>
      </View>

      <View style={styles.cardAmounts}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Ingresos</Text>
          <Text style={[styles.amountValue, { color: "#22c55e" }]}>
            {formatCurrency(item.total_income)}
          </Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Gastos</Text>
          <Text style={[styles.amountValue, { color: "#ef4444" }]}>
            {formatCurrency(item.total_expenses)}
          </Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Txs</Text>
          <Text style={styles.amountValue}>{item.total_transactions}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function AnalysisScreen() {
  const router = useRouter()
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis Análisis</Text>
        <Text style={styles.subtitle}>{snapshots?.length ?? 0} períodos analizados</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#e05c19" style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={snapshots ?? []}
          keyExtractor={(item) => item.snapshot_id}
          renderItem={({ item }) => (
            <SnapshotCard
              item={item}
              onPress={() => router.push({
                pathname: "/(tabs)/analysis/[id]",
                params: { id: item.snapshot_id }
              })}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyTitle}>Sin análisis aún</Text>
              <Text style={styles.emptyText}>
                Sube un estado de cuenta para ver tu análisis aquí.
              </Text>
            </View>
          }
        />
      )}
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
  list: { padding: 12 },
  card: {
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardPeriod: { fontWeight: "700", color: "#1c2b4b", fontSize: 15 },
  cardBank: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  savingsBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  savingsText: { fontSize: 12, fontWeight: "700" },
  cardAmounts: { flexDirection: "row", marginTop: 14, gap: 16 },
  amountItem: { flex: 1 },
  amountLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "600", letterSpacing: 0.5 },
  amountValue: { fontSize: 16, fontWeight: "700", color: "#1c2b4b", marginTop: 2 },
  emptyState: { alignItems: "center", padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#1c2b4b", marginBottom: 8 },
  emptyText: { color: "#6b7280", textAlign: "center", lineHeight: 22 },
})
