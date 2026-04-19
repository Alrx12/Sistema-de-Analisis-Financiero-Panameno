/**
 * SimulacionesScreen — Herramientas de planificación financiera
 * Tab 1: Runway (¿cuántos días me alcanza el saldo?)
 * Tab 2: Escenarios (¿qué pasa si recorto X categoría?)
 */
import { useState, useMemo } from "react"
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAggregatedSummary } from "@safpro/api/analysis"

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Tab Runway ────────────────────────────────────────────────────────────────

function RunwayTab({ avgMonthlyExpenses }: { avgMonthlyExpenses: number }) {
  const [saldo, setSaldo] = useState("")

  const dailyAvg   = avgMonthlyExpenses / 30
  const saldoNum   = parseFloat(saldo.replace(",", ".")) || 0
  const dias       = saldoNum > 0 && dailyAvg > 0 ? Math.floor(saldoNum / dailyAvg) : null

  const color  = dias == null ? "#9ca3af"
    : dias < 15  ? "#ef4444"
    : dias < 30  ? "#f59e0b"
    : "#22c55e"

  const label  = dias == null ? "—"
    : dias < 15  ? "Crítico"
    : dias < 30  ? "Ajustado"
    : "Cómodo"

  const pct = dias != null ? Math.min((dias / 90) * 100, 100) : 0

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
        <Text style={styles.infoText}>
          Basado en tu gasto promedio mensual de {formatCurrency(avgMonthlyExpenses)}{" "}
          ({formatCurrency(dailyAvg)}/día).
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Saldo disponible</Text>
        <View style={styles.inputRow}>
          <Text style={styles.inputPrefix}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={saldo}
            onChangeText={setSaldo}
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      {dias !== null && (
        <>
          {/* Resultado principal */}
          <View style={[styles.resultCard, { borderLeftColor: color }]}>
            <Text style={styles.resultLabel}>Te alcanza para</Text>
            <Text style={[styles.resultDays, { color }]}>{dias} días</Text>
            <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
              <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
            </View>
          </View>

          {/* Barra visual */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabel}>0</Text>
            <Text style={styles.barLabel}>30 días</Text>
            <Text style={styles.barLabel}>90 días</Text>
          </View>

          {/* Desglose */}
          <View style={styles.section}>
            {[
              { label: "1 semana de runway", amount: dailyAvg * 7 },
              { label: "1 mes de runway",    amount: dailyAvg * 30 },
              { label: "3 meses de runway",  amount: dailyAvg * 90 },
            ].map(row => (
              <View key={row.label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{row.label}</Text>
                <Text style={styles.breakdownValue}>{formatCurrency(row.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Estimación basada en datos históricos. Consulta a un profesional financiero antes de tomar decisiones importantes.
        </Text>
      </View>
    </ScrollView>
  )
}

// ── Tab Escenarios ────────────────────────────────────────────────────────────

function EscenariosTab({
  categories,
  totalMonths,
}: {
  categories: Record<string, number>
  totalMonths: number
}) {
  const [reductions, setReductions] = useState<Record<string, number>>({})

  const months = Math.max(totalMonths, 1)

  const sortedCats = useMemo(() =>
    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    [categories]
  )

  const totalSavedMonthly = sortedCats.reduce((sum, [cat]) => {
    const monthly  = categories[cat] / months
    const pct      = reductions[cat] ?? 0
    return sum + (monthly * pct / 100)
  }, 0)

  function setReduction(cat: string, pct: number) {
    setReductions(prev => ({ ...prev, [cat]: Math.max(0, Math.min(100, pct)) }))
  }

  const STEPS = [0, 10, 25, 50]

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.scenarioHint}>
        Toca un porcentaje para simular cuánto ahorrarías si recortas ese gasto.
      </Text>

      {sortedCats.map(([cat, total]) => {
        const monthly  = total / months
        const pct      = reductions[cat] ?? 0
        const saving   = monthly * pct / 100
        return (
          <View key={cat} style={styles.catCard}>
            <View style={styles.catHeader}>
              <Text style={styles.catName}>{cat.replace(/_/g, " ")}</Text>
              <Text style={styles.catMonthly}>{formatCurrency(monthly)}/mes</Text>
            </View>
            <View style={styles.stepsRow}>
              {STEPS.map(step => (
                <TouchableOpacity
                  key={step}
                  style={[
                    styles.stepBtn,
                    pct === step && styles.stepBtnActive,
                  ]}
                  onPress={() => setReduction(cat, step)}
                >
                  <Text style={[
                    styles.stepBtnText,
                    pct === step && styles.stepBtnTextActive,
                  ]}>
                    {step === 0 ? "Sin cambio" : `-${step}%`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {saving > 0 && (
              <Text style={styles.catSaving}>
                Ahorro: {formatCurrency(saving)}/mes · {formatCurrency(saving * 12)}/año
              </Text>
            )}
          </View>
        )
      })}

      {/* Totales */}
      {totalSavedMonthly > 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Ahorro mensual proyectado</Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalSavedMonthly)}</Text>
          <Text style={styles.totalAnual}>
            {formatCurrency(totalSavedMonthly * 12)} al año
          </Text>
        </View>
      )}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Proyección basada en promedios históricos. Los resultados reales pueden variar.
        </Text>
      </View>
    </ScrollView>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function SimulacionesScreen() {
  const [activeTab, setActiveTab] = useState<"runway" | "escenarios">("runway")

  const { data: aggregated, isLoading } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
  })

  const avgMonthlyExpenses = useMemo(() => {
    if (!aggregated) return 0
    const months = aggregated.monthly_trend?.length ?? 1
    return aggregated.total_expenses / Math.max(months, 1)
  }, [aggregated])

  const totalMonths = aggregated?.monthly_trend?.length ?? 1

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Simulaciones</Text>
        <Text style={styles.subtitle}>Proyecta escenarios financieros</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: "runway",     label: "Días de runway" },
          { id: "escenarios", label: "¿Qué pasa si…?" },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <Text style={[styles.tabBtnText, activeTab === tab.id && styles.tabBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#e05c19" style={{ marginTop: 60 }} size="large" />
      ) : !aggregated || aggregated.total_expenses === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flask-outline" size={56} color="#9ca3af" />
          <Text style={styles.emptyTitle}>Sin datos aún</Text>
          <Text style={styles.emptyText}>
            Sube un estado de cuenta para habilitar las simulaciones.
          </Text>
        </View>
      ) : activeTab === "runway" ? (
        <RunwayTab avgMonthlyExpenses={avgMonthlyExpenses} />
      ) : (
        <EscenariosTab categories={aggregated.categories} totalMonths={totalMonths} />
      )}
    </SafeAreaView>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f5f7" },
  header: {
    backgroundColor: "#1c2b4b",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title:    { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#93afd4", fontSize: 13, marginTop: 2 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: "#e05c19" },
  tabBtnText:       { fontSize: 13, color: "#6b7280", fontWeight: "600" },
  tabBtnTextActive: { color: "#e05c19" },
  tabContent: { padding: 16, paddingBottom: 40 },
  infoCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  infoText: { color: "#0369a1", fontSize: 13, flex: 1, lineHeight: 18 },
  section:  { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    height: 48,
  },
  inputPrefix: { fontSize: 18, color: "#374151", marginRight: 4 },
  input: { flex: 1, fontSize: 18, color: "#1c2b4b", fontWeight: "600" },
  resultCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    alignItems: "flex-start",
    gap: 8,
  },
  resultLabel: { fontSize: 13, color: "#6b7280", fontWeight: "600" },
  resultDays:  { fontSize: 40, fontWeight: "800" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: "700" },
  barTrack: {
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 5,
    marginBottom: 4,
    overflow: "hidden",
  },
  barFill:   { height: "100%", borderRadius: 5 },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  barLabel: { fontSize: 11, color: "#9ca3af" },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  breakdownLabel: { color: "#6b7280", fontSize: 14 },
  breakdownValue: { color: "#1c2b4b", fontWeight: "700", fontSize: 14 },
  disclaimer: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  disclaimerText: { color: "#9ca3af", fontSize: 12, lineHeight: 18, textAlign: "center" },
  // Escenarios
  scenarioHint: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  catCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  catName:    { fontSize: 14, fontWeight: "700", color: "#1c2b4b", textTransform: "capitalize" },
  catMonthly: { fontSize: 13, color: "#6b7280" },
  stepsRow:   { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  stepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  stepBtnActive: { borderColor: "#e05c19", backgroundColor: "#fef3ec" },
  stepBtnText:       { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  stepBtnTextActive: { color: "#e05c19" },
  catSaving: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: "600",
    marginTop: 8,
  },
  totalCard: {
    backgroundColor: "#1c2b4b",
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  totalLabel:  { color: "#93afd4", fontSize: 13, marginBottom: 4 },
  totalAmount: { color: "#ffffff", fontSize: 32, fontWeight: "800" },
  totalAnual:  { color: "#93afd4", fontSize: 13, marginTop: 4 },
  // Empty state
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#1c2b4b", marginTop: 16, marginBottom: 8 },
  emptyText:  { color: "#6b7280", textAlign: "center", lineHeight: 22 },
})
