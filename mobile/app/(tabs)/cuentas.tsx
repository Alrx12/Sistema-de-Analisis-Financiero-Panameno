/**
 * CuentasScreen — Resumen financiero por banco/cuenta
 * Replica el "Resumen financiero" del web con selector de banco,
 * KPIs consolidados y botón para subir estado de cuenta.
 * Tema: dark navy
 */
import { useState } from "react"
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAggregatedSummary, listAnalysis } from "@safpro/api/analysis"
import type { AnalysisSnapshot } from "@safpro/types"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const GREEN  = "#22c55e"
const RED    = "#ef4444"

function formatCurrency(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1000) {
    return "$" + (Math.abs(n) / 1000).toFixed(1) + "k"
  }
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Chip de banco ─────────────────────────────────────────────────────────────
function BankChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.bankChip, active && styles.bankChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {active
        ? <Ionicons name="server" size={12} color={INDIGO} style={{ marginRight: 4 }} />
        : <Ionicons name="business-outline" size={12} color={MUTED} style={{ marginRight: 4 }} />}
      <Text style={[styles.bankChipText, active && styles.bankChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ── Tarjeta KPI ───────────────────────────────────────────────────────────────
function KpiBlock({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <View style={[styles.kpiBlock, { borderColor: `${color}30` }]}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function CuentasScreen() {
  const router  = useRouter()
  const [selectedBank, setSelectedBank] = useState<string | null>(null)

  const {
    data: snapshots,
    isLoading: loadingSnaps,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: ["analysis"], queryFn: listAnalysis })

  const { data: aggregated, isLoading: loadingAgg } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
  })

  // Extraer bancos únicos
  const banks = snapshots
    ? [...new Map(
        snapshots
          .filter((s) => !!s.bank_account)
          .map((s) => [
            s.bank_account!.account_last4,
            {
              key:  s.bank_account!.account_last4 ?? "??",
              name: s.bank_account!.bank_name,
              last4: s.bank_account!.account_last4,
            },
          ])
      ).values()]
    : []

  // Snapshots filtrados por banco seleccionado
  const filteredSnaps: AnalysisSnapshot[] = selectedBank
    ? (snapshots ?? []).filter((s) => s.bank_account?.account_last4 === selectedBank)
    : (snapshots ?? [])

  // Agregado del filtro
  const filtIncome   = filteredSnaps.reduce((a, s) => a + s.total_income, 0)
  const filtExpenses = filteredSnaps.reduce((a, s) => a + s.total_expenses, 0)
  const filtBalance  = filtIncome - filtExpenses
  const filtTxs      = filteredSnaps.reduce((a, s) => a + s.total_transactions, 0)

  const isLoading = loadingSnaps || loadingAgg
  const hasData   = snapshots && snapshots.length > 0

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Resumen financiero</Text>
          <Text style={styles.subtitle}>
            {selectedBank
              ? `Cuenta ····${selectedBank}`
              : `Todos los períodos · ${banks.length} ${banks.length === 1 ? "banco" : "bancos"} consolidados`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={() => router.push("/(tabs)/upload")}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={TEXT} />
          <Text style={styles.uploadBtnText}>Subir estado</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />}
      >
        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : !hasData ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={52} color={MUTED} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>Sin cuentas conectadas</Text>
            <Text style={styles.emptyText}>
              Sube un estado de cuenta bancario para ver tu resumen aquí.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push("/(tabs)/upload")}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Subir estado de cuenta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Selector de banco */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bankScroll}
            >
              <BankChip
                label={`Consolidado (${banks.length})`}
                active={selectedBank === null}
                onPress={() => setSelectedBank(null)}
              />
              {banks.map((b) => (
                <BankChip
                  key={b.key}
                  label={`${b.name} ····${b.last4}`}
                  active={selectedBank === b.key}
                  onPress={() => setSelectedBank(b.key)}
                />
              ))}
            </ScrollView>

            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <KpiBlock label="INGRESOS"      value={formatCurrency(filtIncome)}   color={GREEN}    icon="trending-up" />
              <KpiBlock label="GASTOS"        value={formatCurrency(filtExpenses)} color={RED}      icon="trending-down" />
              <KpiBlock label="BALANCE"       value={formatCurrency(filtBalance)}  color={filtBalance >= 0 ? "#3b82f6" : "#f97316"} icon="swap-vertical" />
              <KpiBlock label="TRANSACCIONES" value={String(filtTxs)}              color="#8b5cf6"  icon="list-outline" />
            </View>

            {/* Lista de snapshots */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Estados de cuenta subidos</Text>
              {filteredSnaps.slice(0, 8).map((snap) => {
                const balance = snap.balance
                const positive = balance >= 0
                return (
                  <View key={snap.snapshot_id} style={styles.snapRow}>
                    <View style={styles.snapIcon}>
                      <Ionicons name="document-text-outline" size={16} color={INDIGO} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.snapBank} numberOfLines={1}>
                        {snap.bank_account
                          ? `${snap.bank_account.bank_name} ····${snap.bank_account.account_last4}`
                          : "Sin banco"}
                      </Text>
                      <Text style={styles.snapPeriod}>
                        {snap.period_start ? new Date(snap.period_start).toLocaleDateString("es-PA", { month: "short", year: "numeric" }) : "—"}
                        {" — "}
                        {snap.period_end ? new Date(snap.period_end).toLocaleDateString("es-PA", { month: "short", year: "numeric" }) : "—"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.snapBalance, { color: positive ? GREEN : RED }]}>
                        {formatCurrency(balance, true)}
                      </Text>
                      <Text style={styles.snapTxs}>{snap.total_transactions} txs</Text>
                    </View>
                  </View>
                )
              })}
              {filteredSnaps.length > 8 && (
                <Text style={styles.moreText}>+{filteredSnaps.length - 8} más en Análisis</Text>
              )}
            </View>
          </>
        )}
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title:    { color: TEXT,  fontSize: 20, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 12, marginTop: 3, maxWidth: 200 },

  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: INDIGO,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  uploadBtnText: { color: TEXT, fontSize: 13, fontWeight: "600" },

  // Bank chips
  bankScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  bankChip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bankChipActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
    borderColor: "rgba(99,102,241,0.35)",
  },
  bankChipText:       { color: MUTED, fontSize: 12, fontWeight: "600" },
  bankChipTextActive: { color: "#a5b4fc" },

  // KPIs
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10, marginBottom: 4 },
  kpiBlock: {
    width: "47%",
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  kpiIcon:  { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  kpiLabel: { color: MUTED, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  kpiValue: { fontSize: 18, fontWeight: "800" },

  // Snapshots section
  section: {
    backgroundColor: CARD,
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  snapRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  snapIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  snapBank:    { color: TEXT,  fontSize: 13, fontWeight: "600" },
  snapPeriod:  { color: MUTED, fontSize: 11, marginTop: 1 },
  snapBalance: { fontSize: 14, fontWeight: "700" },
  snapTxs:     { color: DIM as string, fontSize: 11 },
  moreText:    { color: MUTED, fontSize: 12, textAlign: "center", paddingTop: 10 },

  // Empty state
  emptyState: { alignItems: "center", padding: 56 },
  emptyTitle: { color: TEXT,  fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: INDIGO,
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
})
