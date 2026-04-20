/**
 * AnalysisListScreen — historial de snapshots
 * Tema: dark navy — idéntico al web
 */
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { listAnalysis } from "@safpro/api/analysis"
import type { AnalysisSnapshot } from "@safpro/types"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"

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
  const positive = Number(savingsRate) >= 0

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
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
          backgroundColor: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        }]}>
          <Text style={[styles.savingsText, { color: positive ? "#22c55e" : "#ef4444" }]}>
            {savingsRate}% ahorro
          </Text>
        </View>
      </View>

      <View style={styles.cardAmounts}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>INGRESOS</Text>
          <Text style={[styles.amountValue, { color: "#22c55e" }]}>
            {formatCurrency(item.total_income)}
          </Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>GASTOS</Text>
          <Text style={[styles.amountValue, { color: "#ef4444" }]}>
            {formatCurrency(item.total_expenses)}
          </Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>TXS</Text>
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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis Análisis</Text>
        <Text style={styles.subtitle}>{snapshots?.length ?? 0} períodos analizados</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
      ) : (
        <FlatList
          data={snapshots ?? []}
          keyExtractor={(item) => item.snapshot_id}
          renderItem={({ item }) => (
            <SnapshotCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/analysis/[id]",
                  params: { id: item.snapshot_id },
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  safe: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 22, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },
  list: { padding: 12 },
  card: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: BORDER,
  },
  cardHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardPeriod:   { fontWeight: "700", color: TEXT,  fontSize: 14 },
  cardBank:     { color: MUTED, fontSize: 12, marginTop: 2 },
  savingsBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  savingsText:  { fontSize: 12, fontWeight: "700" },
  cardAmounts:  { flexDirection: "row", marginTop: 14, gap: 12 },
  amountItem:   { flex: 1 },
  amountLabel:  { fontSize: 9, color: DIM as string, fontWeight: "700", letterSpacing: 0.8 },
  amountValue:  { fontSize: 15, fontWeight: "700", color: TEXT, marginTop: 3 },
  emptyState:   { alignItems: "center", padding: 56 },
  emptyEmoji:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: "700", color: TEXT,  marginBottom: 8 },
  emptyText:    { color: MUTED, textAlign: "center", lineHeight: 22 },
})
