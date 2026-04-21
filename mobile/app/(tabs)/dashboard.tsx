/**
 * Dashboard — KPIs + Charts (react-native-gifted-charts)
 * Tema: dark navy — #070c18 bg, #0d1426 cards, acento #6366f1
 */
import { useState, useMemo } from "react"
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity, Dimensions,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useQueries } from "@tanstack/react-query"
import { BarChart, PieChart } from "react-native-gifted-charts"
import { getAggregatedSummary } from "@safpro/api/analysis"
import { getMe } from "@safpro/api/users"

// ── Dimensions ─────────────────────────────────────────────────────────────────
const { width: W } = Dimensions.get("window")
const CHART_W = W - 48

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
const BLUE   = "#3b82f6"

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const PIE_COLORS   = ["#6366f1","#22c55e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#10b981","#f97316"]

function fmt(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return "$" + (abs / 1_000_000).toFixed(1) + "M"
  if (abs >= 1_000)     return "$" + (abs / 1_000).toFixed(1) + "k"
  return "$" + abs.toFixed(0)
}

/** Returns last N months as { year, month }, oldest first */
function lastNMonths(n: number) {
  const now = new Date()
  const result: { year: number; month: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return result
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.kpiCard, { borderTopColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState<number | null>(null) // null = año completo

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })

  // ── Main aggregated query (current filter) ────────────────────────────────
  const params = selMonth === null
    ? { year: selYear }
    : { year: selYear, month: selMonth }

  const { data: main, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["agg", selYear, selMonth],
    queryFn:  () => getAggregatedSummary(params),
    enabled:  !!user,
  })

  // ── Trend: last 6 months (parallel) ──────────────────────────────────────
  const trendSlots = useMemo(() => lastNMonths(6), [])
  const trendQ = useQueries({
    queries: trendSlots.map(({ year, month }) => ({
      queryKey: ["agg", year, month],
      queryFn:  () => getAggregatedSummary({ year, month }),
      enabled:  !!user,
    })),
  })
  const trendReady = trendQ.every(q => !!q.data)

  // ── Derived chart data ────────────────────────────────────────────────────
  const trendBarData = trendReady
    ? trendSlots.flatMap(({ month }, i) => {
        const d = trendQ[i].data!
        return [
          {
            value:      d.total_income ?? 0,
            label:      MONTHS_LABEL[month - 1],
            frontColor: GREEN,
            spacing:    4,
            labelWidth: 32,
          },
          {
            value:      d.total_expenses ?? 0,
            frontColor: RED,
            spacing:    20,
            labelWidth: 32,
          },
        ]
      })
    : []

  const maxTrend = trendReady
    ? Math.max(
        1,
        ...trendQ.map(q => Math.max(q.data?.total_income ?? 0, q.data?.total_expenses ?? 0))
      ) * 1.25
    : 1

  const pieData = main
    ? Object.entries(main.categories)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 7)
        .map(([name, amount], i) => ({
          value:   amount as number,
          color:   PIE_COLORS[i % PIE_COLORS.length],
          _name:   name,
          _amount: amount as number,
        }))
    : []

  const merchantBarData = main
    ? main.top_merchants.slice(0, 6).map((m: { name: string; amount: number }, i: number) => ({
        value:      m.amount,
        label:      m.name.length > 9 ? m.name.slice(0, 8) + "…" : m.name,
        frontColor: PIE_COLORS[i % PIE_COLORS.length],
        labelWidth: 56,
      }))
    : []

  const maxMerchant = merchantBarData.length
    ? Math.max(1, ...merchantBarData.map((d: { value: number }) => d.value)) * 1.25
    : 1

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]
  const greeting = user?.full_name?.split(" ")[0] ?? "Usuario"

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScrollView
        style={s.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />
        }
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View style={s.logoChip}>
              <Text style={s.logoText}>S</Text>
            </View>
            <Text style={s.logoLabel}>SAFPRO</Text>
          </View>
          <Text style={s.greeting}>Hola, {greeting} 👋</Text>
          <Text style={s.headerSub}>Tu resumen financiero</Text>
        </View>

        {/* ── Year filter ── */}
        <View style={s.pillRow}>
          {years.map(y => (
            <TouchableOpacity
              key={y}
              style={[s.pill, selYear === y && s.pillOn]}
              onPress={() => setSelYear(y)}
            >
              <Text style={[s.pillText, selYear === y && s.pillTextOn]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Month filter ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.monthScroll}
          contentContainerStyle={s.monthContent}
        >
          <TouchableOpacity
            style={[s.pill, selMonth === null && s.pillOn]}
            onPress={() => setSelMonth(null)}
          >
            <Text style={[s.pillText, selMonth === null && s.pillTextOn]}>Todo el año</Text>
          </TouchableOpacity>
          {MONTHS_LABEL.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={[s.pill, selMonth === i + 1 && s.pillOn]}
              onPress={() => setSelMonth(i + 1)}
            >
              <Text style={[s.pillText, selMonth === i + 1 && s.pillTextOn]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Content ── */}
        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : main ? (
          <>
            {/* KPI Grid */}
            <View style={s.kpiGrid}>
              <KpiCard label="INGRESOS"      value={fmt(main.total_income)}   color={GREEN} />
              <KpiCard label="GASTOS"        value={fmt(main.total_expenses)} color={RED}   />
              <KpiCard
                label="BALANCE"
                value={fmt(main.balance)}
                color={main.balance >= 0 ? BLUE : "#f97316"}
              />
              <KpiCard label="TRANSACCIONES" value={String(main.total_transactions)} color="#8b5cf6" />
            </View>

            {/* Trend BarChart */}
            {trendReady && trendBarData.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Tendencia — últimos 6 meses" />
                <Text style={s.legend}>
                  <Text style={{ color: GREEN }}>■</Text>
                  {" Ingresos  "}
                  <Text style={{ color: RED }}>■</Text>
                  {" Gastos"}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={trendBarData}
                    barWidth={16}
                    barBorderRadius={4}
                    backgroundColor={CARD}
                    yAxisColor="transparent"
                    xAxisColor={BORDER}
                    yAxisTextStyle={{ color: MUTED, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: MUTED, fontSize: 9 }}
                    noOfSections={4}
                    maxValue={maxTrend}
                    height={160}
                    width={CHART_W - 16}
                    hideRules
                    isAnimated
                    formatYLabel={(v: string) => fmtK(Number(v))}
                  />
                </ScrollView>
              </View>
            )}

            {/* Categories PieChart */}
            {pieData.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Por Categoría" />
                <View style={s.pieRow}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={72}
                    innerRadius={42}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ color: DIM, fontSize: 10, fontWeight: "700" }}>CAT</Text>
                        <Text style={{ color: INDIGO, fontSize: 14, fontWeight: "800" }}>
                          {pieData.length}
                        </Text>
                      </View>
                    )}
                  />
                  <View style={s.pieRight}>
                    {pieData.map((d, i) => (
                      <View key={i} style={s.legendRow}>
                        <View style={[s.dot, { backgroundColor: d.color }]} />
                        <Text style={s.legendName} numberOfLines={1}>{d._name}</Text>
                        <Text style={s.legendAmt}>{fmtK(d._amount)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Merchants BarChart */}
            {merchantBarData.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Top Comercios" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={merchantBarData}
                    barWidth={28}
                    barBorderRadius={6}
                    backgroundColor={CARD}
                    yAxisColor="transparent"
                    xAxisColor={BORDER}
                    yAxisTextStyle={{ color: MUTED, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: MUTED, fontSize: 9 }}
                    noOfSections={4}
                    maxValue={maxMerchant}
                    height={140}
                    width={Math.max(CHART_W - 16, merchantBarData.length * 72)}
                    hideRules
                    isAnimated
                    formatYLabel={(v: string) => fmtK(Number(v))}
                  />
                </ScrollView>
              </View>
            )}

            {/* Recommendations */}
            {Array.isArray(main.recommendations) && main.recommendations.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Recomendaciones IA" />
                {(main.recommendations as string[]).map((r, i) => (
                  <View key={i} style={s.recRow}>
                    <Text style={s.recBullet}>💡</Text>
                    <Text style={s.recText}>{r}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📂</Text>
            <Text style={s.emptyTitle}>Sin datos aún</Text>
            <Text style={s.emptyText}>
              Sube tu estado de cuenta en "Subir" o registra gastos manualmente.
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },

  // Header
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  logoChip:  {
    width: 28, height: 28, borderRadius: 8, backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  logoText:  { color: "#fff", fontSize: 14, fontWeight: "800" },
  logoLabel: { color: TEXT, fontSize: 15, fontWeight: "700", letterSpacing: 1.5 },
  greeting:  { color: TEXT, fontSize: 24, fontWeight: "700" },
  headerSub: { color: MUTED, fontSize: 14, marginTop: 3 },

  // Filter pills
  pillRow:     { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  monthScroll: { paddingBottom: 8 },
  monthContent:{ gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  pillOn:      { backgroundColor: INDIGO, borderColor: INDIGO },
  pillText:    { color: MUTED, fontSize: 13, fontWeight: "600" },
  pillTextOn:  { color: "#fff" },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  kpiCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 16, width: "47%",
    borderWidth: 1, borderColor: BORDER, borderTopWidth: 2,
  },
  kpiLabel: { fontSize: 10, color: MUTED, fontWeight: "700", letterSpacing: 1.2 },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 6 },

  // Cards / sections
  card: {
    backgroundColor: CARD, marginHorizontal: 12, marginBottom: 12,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 10, letterSpacing: 0.3 },
  legend:       { fontSize: 12, color: MUTED, marginBottom: 10 },

  // Pie
  pieRow:  { flexDirection: "row", alignItems: "center", gap: 14 },
  pieRight:{ flex: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  legendName:{ flex: 1, color: MUTED, fontSize: 12 },
  legendAmt: { color: TEXT, fontSize: 12, fontWeight: "600" },

  // Recommendations
  recRow:    { flexDirection: "row", gap: 10, marginBottom: 10 },
  recBullet: { fontSize: 16 },
  recText:   { flex: 1, color: MUTED, fontSize: 13, lineHeight: 20 },

  // Empty state
  empty:      { alignItems: "center", padding: 56 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22, fontSize: 14 },
})
