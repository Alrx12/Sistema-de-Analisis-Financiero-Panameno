/**
 * Dashboard — KPIs + Charts (react-native-gifted-charts)
 * v2: filtro banco, donut por rol de presupuesto
 * Tema: dark navy — #070c18 bg, #0d1426 cards, acento #6366f1
 */
import { useState, useMemo, useCallback } from "react"
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity, Dimensions, TextInput,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useQueries } from "@tanstack/react-query"
import { BarChart, PieChart } from "react-native-gifted-charts"
import { getAggregatedSummary, listAnalysis } from "@safpro/api/analysis"
import { getMe } from "@safpro/api/users"
import { searchTransactions } from "@safpro/api/transactions"
import type { TransactionSearchResult } from "@safpro/types"

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

// Rol de presupuesto → color semántico
const ROLE_COLORS: Record<string, string> = {
  presupuestable:    "#6366f1",
  no_presupuestable: "#f59e0b",
  gasto_operativo:   "#3b82f6",
  gasto_financiero:  "#6b7280",
  ahorro_inversion:  "#10b981",
  revisar:           "#ef4444",
  otros:             "#94a3b8",
}
const ROLE_LABEL: Record<string, string> = {
  presupuestable:    "Presupuestable",
  no_presupuestable: "No presupuestable",
  gasto_operativo:   "Gasto operativo",
  gasto_financiero:  "Cargo financiero",
  ahorro_inversion:  "Ahorro / Inversión",
  revisar:           "Revisar",
}

// Categorías rápidas para el buscador
const SEARCH_CATEGORIES: { key: string; label: string }[] = [
  { key: "restaurantes",   label: "Restaurantes" },
  { key: "supermercado",   label: "Supermercado" },
  { key: "alimentacion",   label: "Alimentación" },
  { key: "transporte",     label: "Transporte" },
  { key: "gasolina",       label: "Gasolina" },
  { key: "suscripciones",  label: "Suscripciones" },
  { key: "entretenimiento",label: "Entretenimiento" },
  { key: "tecnologia",     label: "Tecnología" },
  { key: "salud",          label: "Salud" },
  { key: "educacion",      label: "Educación" },
  { key: "servicios",      label: "Servicios" },
  { key: "compras",        label: "Compras" },
  { key: "ahorro",         label: "Ahorro" },
  { key: "otros",          label: "Otros" },
]

const CATEGORY_EMOJI: Record<string, string> = {
  restaurantes: "🍽", supermercado: "🛒", alimentacion: "🥦",
  transporte: "🚌", gasolina: "⛽", suscripciones: "📱",
  entretenimiento: "🎬", tecnologia: "💻", salud: "🏥",
  educacion: "📚", servicios: "🔧", compras: "🛍",
  ahorro: "💰", otros: "📦",
}

const SEARCH_PAGE_SIZE = 20

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

/** Abreviación del banco para la pill */
function bankShort(name: string): string {
  if (name.includes("General"))   return "BG"
  if (name.includes("BAC"))       return "BAC"
  if (name.includes("Banistmo"))  return "Banistmo"
  if (name.includes("Banesco"))   return "Banesco"
  if (name.includes("Credicorp")) return "Credicorp"
  return name.slice(0, 8)
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
  const [selYear,   setSelYear]   = useState(now.getFullYear())
  const [selMonth,  setSelMonth]  = useState<number | null>(null)
  const [selBankId, setSelBankId] = useState<string | null>(null)

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchOpen,     setSearchOpen]     = useState(false)
  const [searchInput,    setSearchInput]    = useState("")
  const [searchCategory, setSearchCategory] = useState<string | null>(null)
  const [searchMonth,    setSearchMonth]    = useState<number | null>(null)
  const [searchBankId,   setSearchBankId]   = useState<string | null>(null)
  const [searchLimit,    setSearchLimit]    = useState(SEARCH_PAGE_SIZE)
  // "committed" params — only update when user taps Buscar
  const [committed, setCommitted] = useState<{
    q: string; category: string | null; year: number;
    month: number | null; bankId: string | null;
  } | null>(null)

  const commitSearch = useCallback(() => {
    setSearchLimit(SEARCH_PAGE_SIZE)
    setCommitted({
      q: searchInput.trim(), category: searchCategory,
      year: selYear, month: searchMonth, bankId: searchBankId,
    })
  }, [searchInput, searchCategory, selYear, searchMonth, searchBankId])

  const hasFilter = committed && (
    committed.q.length > 0 || !!committed.category || !!committed.month || !!committed.bankId
  )

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["tx-search", committed, searchLimit],
    queryFn: () => searchTransactions({
      q:               committed!.q || undefined,
      budget_category: committed!.category || undefined,
      year:            committed!.year,
      month:           committed!.month || undefined,
      bank_account_id: committed!.bankId || undefined,
      limit:           searchLimit,
      offset:          0,
    }),
    enabled: !!committed && !!hasFilter,
  })

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })

  // ── Snapshots (para derivar lista de bancos) ──────────────────────────────
  const { data: snapshots } = useQuery({
    queryKey: ["analysis"],
    queryFn:  listAnalysis,
    enabled:  !!user,
  })

  /** Bancos únicos detectados en los snapshots del usuario */
  const banks = useMemo(() => {
    if (!snapshots) return []
    const seen = new Map<string, { id: string; name: string; last4: string | null }>()
    for (const s of snapshots) {
      if (s.bank_account) {
        seen.set(s.bank_account.account_id, {
          id:    s.bank_account.account_id,
          name:  s.bank_account.bank_name,
          last4: s.bank_account.account_last4,
        })
      }
    }
    return [...seen.values()]
  }, [snapshots])

  // ── Main aggregated query (current filter) ────────────────────────────────
  const params = {
    year:  selYear,
    ...(selMonth   !== null ? { month: selMonth }             : {}),
    ...(selBankId  !== null ? { bank_account_id: selBankId }  : {}),
  }

  const { data: main, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["agg", selYear, selMonth, selBankId],
    queryFn:  () => getAggregatedSummary(params),
    enabled:  !!user,
  })

  // ── Trend: last 6 months (parallel) ──────────────────────────────────────
  const trendSlots = useMemo(() => lastNMonths(6), [])
  const trendQ = useQueries({
    queries: trendSlots.map(({ year, month }) => ({
      queryKey: ["agg", year, month, selBankId],
      queryFn:  () => getAggregatedSummary({ year, month, ...(selBankId ? { bank_account_id: selBankId } : {}) }),
      enabled:  !!user,
    })),
  })
  const trendReady = trendQ.every(q => !!q.data)

  // ── Chart data ────────────────────────────────────────────────────────────
  const trendBarData = trendReady
    ? trendSlots.flatMap(({ month }, i) => {
        const d = trendQ[i].data!
        return [
          { value: d.total_income ?? 0,   label: MONTHS_LABEL[month - 1], frontColor: GREEN, spacing: 4, labelWidth: 32 },
          { value: d.total_expenses ?? 0, frontColor: RED,  spacing: 20, labelWidth: 32 },
        ]
      })
    : []

  const maxTrend = trendReady
    ? Math.max(1, ...trendQ.map(q => Math.max(q.data?.total_income ?? 0, q.data?.total_expenses ?? 0))) * 1.25
    : 1

  const pieData = main
    ? Object.entries(main.categories)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 7)
        .map(([name, amount], i) => ({
          value: amount as number,
          color: PIE_COLORS[i % PIE_COLORS.length],
          _name: name, _amount: amount as number,
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

  /** Donut por rol de presupuesto — excluir solo_balance */
  const roleData = main
    ? (main.by_budget_role ?? [])
        .filter((r: { type: string }) => r.type !== "solo_balance" && r.type !== "revisar")
        .sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount)
        .slice(0, 6)
        .map((r: { type: string; amount: number }, i: number) => ({
          value:   r.amount,
          color:   ROLE_COLORS[r.type] ?? PIE_COLORS[i],
          _type:   r.type,
          _amount: r.amount,
        }))
    : []

  const years    = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll} contentContainerStyle={s.monthContent}>
          <TouchableOpacity style={[s.pill, selMonth === null && s.pillOn]} onPress={() => setSelMonth(null)}>
            <Text style={[s.pillText, selMonth === null && s.pillTextOn]}>Todo el año</Text>
          </TouchableOpacity>
          {MONTHS_LABEL.map((m, i) => (
            <TouchableOpacity key={i} style={[s.pill, selMonth === i + 1 && s.pillOn]} onPress={() => setSelMonth(i + 1)}>
              <Text style={[s.pillText, selMonth === i + 1 && s.pillTextOn]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Bank filter (solo si hay más de 1 cuenta) ── */}
        {banks.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.monthContent, { paddingBottom: 4 }]}>
            <TouchableOpacity style={[s.pill, selBankId === null && s.pillOn]} onPress={() => setSelBankId(null)}>
              <Text style={[s.pillText, selBankId === null && s.pillTextOn]}>Todos los bancos</Text>
            </TouchableOpacity>
            {banks.map(b => {
              const short = bankShort(b.name)
              const label = b.last4 ? `${short} ···${b.last4}` : short
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[s.pill, selBankId === b.id && s.pillOn]}
                  onPress={() => setSelBankId(b.id)}
                >
                  <Text style={[s.pillText, selBankId === b.id && s.pillTextOn]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}

        {/* ── Content ── */}
        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : main ? (
          <>
            {/* KPI Grid */}
            <View style={s.kpiGrid}>
              <KpiCard label="INGRESOS"      value={fmt(main.total_income)}        color={GREEN} />
              <KpiCard label="GASTOS"        value={fmt(main.total_expenses)}       color={RED}   />
              <KpiCard label="BALANCE"       value={fmt(main.balance)}
                color={main.balance >= 0 ? BLUE : "#f97316"} />
              <KpiCard label="TRANSACCIONES" value={String(main.total_transactions)} color="#8b5cf6" />
            </View>

            {/* Trend BarChart */}
            {trendReady && trendBarData.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Tendencia — últimos 6 meses" />
                <Text style={s.legend}>
                  <Text style={{ color: GREEN }}>■</Text>{" Ingresos  "}
                  <Text style={{ color: RED }}>■</Text>{" Gastos"}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={trendBarData}
                    barWidth={16} barBorderRadius={4}
                    backgroundColor={CARD}
                    yAxisColor="transparent" xAxisColor={BORDER}
                    yAxisTextStyle={{ color: MUTED, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: MUTED, fontSize: 9 }}
                    noOfSections={4} maxValue={maxTrend}
                    height={160} width={CHART_W - 16}
                    hideRules isAnimated
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
                    data={pieData} donut radius={72} innerRadius={42}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ color: DIM, fontSize: 10, fontWeight: "700" }}>CAT</Text>
                        <Text style={{ color: INDIGO, fontSize: 14, fontWeight: "800" }}>{pieData.length}</Text>
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

            {/* Rol de presupuesto donut */}
            {roleData.length > 0 && (
              <View style={s.card}>
                <SectionTitle title="Rol en presupuesto" />
                <View style={s.pieRow}>
                  <PieChart
                    data={roleData} donut radius={72} innerRadius={42}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ color: DIM, fontSize: 9, fontWeight: "700" }}>ROL</Text>
                        <Text style={{ color: "#f59e0b", fontSize: 13, fontWeight: "800" }}>
                          {fmtK(roleData.reduce((a: number, d: { _amount: number }) => a + d._amount, 0))}
                        </Text>
                      </View>
                    )}
                  />
                  <View style={s.pieRight}>
                    {roleData.map((d: { color: string; _type: string; _amount: number }, i: number) => (
                      <View key={i} style={s.legendRow}>
                        <View style={[s.dot, { backgroundColor: d.color }]} />
                        <Text style={s.legendName} numberOfLines={1}>
                          {ROLE_LABEL[d._type] ?? d._type}
                        </Text>
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
                    barWidth={28} barBorderRadius={6}
                    backgroundColor={CARD}
                    yAxisColor="transparent" xAxisColor={BORDER}
                    yAxisTextStyle={{ color: MUTED, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: MUTED, fontSize: 9 }}
                    noOfSections={4} maxValue={maxMerchant}
                    height={140} width={Math.max(CHART_W - 16, merchantBarData.length * 72)}
                    hideRules isAnimated
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

        {/* ── Buscador cross-snapshot ── */}
        {!!user && (
          <View style={s.searchSection}>
            {/* Encabezado colapsable */}
            <TouchableOpacity
              style={s.searchHeader}
              onPress={() => setSearchOpen(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={s.searchHeaderText}>🔍  Buscar transacciones</Text>
              <Text style={[s.searchChevron, searchOpen && { transform: [{ rotate: "180deg" }] }]}>
                ▾
              </Text>
            </TouchableOpacity>

            {searchOpen && (
              <View style={s.searchBody}>
                {/* Input */}
                <TextInput
                  style={s.searchInput}
                  placeholder="Netflix, Uber, TRESCUATES…"
                  placeholderTextColor={MUTED}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={commitSearch}
                  autoCapitalize="none"
                />

                {/* Categorías */}
                <Text style={s.searchFilterLabel}>Categoría</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.searchPillRow}>
                  <TouchableOpacity
                    style={[s.searchPill, !searchCategory && s.searchPillOn]}
                    onPress={() => setSearchCategory(null)}
                  >
                    <Text style={[s.searchPillText, !searchCategory && s.searchPillTextOn]}>Todas</Text>
                  </TouchableOpacity>
                  {SEARCH_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.key}
                      style={[s.searchPill, searchCategory === c.key && s.searchPillOn]}
                      onPress={() => setSearchCategory(prev => prev === c.key ? null : c.key)}
                    >
                      <Text style={[s.searchPillText, searchCategory === c.key && s.searchPillTextOn]}>
                        {CATEGORY_EMOJI[c.key]} {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Mes */}
                <Text style={s.searchFilterLabel}>Mes (año {selYear})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.searchPillRow}>
                  <TouchableOpacity
                    style={[s.searchPill, !searchMonth && s.searchPillOn]}
                    onPress={() => setSearchMonth(null)}
                  >
                    <Text style={[s.searchPillText, !searchMonth && s.searchPillTextOn]}>Todos</Text>
                  </TouchableOpacity>
                  {MONTHS_LABEL.map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.searchPill, searchMonth === i + 1 && s.searchPillOn]}
                      onPress={() => setSearchMonth(prev => prev === i + 1 ? null : i + 1)}
                    >
                      <Text style={[s.searchPillText, searchMonth === i + 1 && s.searchPillTextOn]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Banco (solo si hay varios) */}
                {banks.length > 1 && (
                  <>
                    <Text style={s.searchFilterLabel}>Banco</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.searchPillRow}>
                      <TouchableOpacity
                        style={[s.searchPill, !searchBankId && s.searchPillOn]}
                        onPress={() => setSearchBankId(null)}
                      >
                        <Text style={[s.searchPillText, !searchBankId && s.searchPillTextOn]}>Todos</Text>
                      </TouchableOpacity>
                      {banks.map(b => {
                        const label = b.last4 ? `${bankShort(b.name)} ···${b.last4}` : bankShort(b.name)
                        return (
                          <TouchableOpacity
                            key={b.id}
                            style={[s.searchPill, searchBankId === b.id && s.searchPillOn]}
                            onPress={() => setSearchBankId(prev => prev === b.id ? null : b.id)}
                          >
                            <Text style={[s.searchPillText, searchBankId === b.id && s.searchPillTextOn]}>{label}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  </>
                )}

                {/* Botón buscar */}
                <TouchableOpacity style={s.searchBtn} onPress={commitSearch} activeOpacity={0.8}>
                  <Text style={s.searchBtnText}>Buscar</Text>
                </TouchableOpacity>

                {/* Resultados */}
                {searchLoading && (
                  <ActivityIndicator color={INDIGO} style={{ marginVertical: 20 }} />
                )}

                {!searchLoading && committed && hasFilter && searchResults && (
                  <>
                    <View style={s.searchResultsHeader}>
                      <Text style={s.searchResultsCount}>
                        {searchResults.total === 0
                          ? "Sin resultados"
                          : `${searchResults.total} resultado${searchResults.total !== 1 ? "s" : ""}`}
                      </Text>
                      {searchResults.total > 0 && (
                        <Text style={s.searchResultsShowing}>
                          Mostrando {Math.min(searchResults.transactions.length, searchResults.total)}
                        </Text>
                      )}
                    </View>

                    {searchResults.transactions.map((tx: TransactionSearchResult) => {
                      const isDebit  = tx.amount < 0
                      const emoji    = CATEGORY_EMOJI[tx.budget_category ?? ""] ?? "💳"
                      const bankInfo = banks.find(b => b.id === tx.bank_account_id)
                      const bankTag  = bankInfo ? bankShort(bankInfo.name) : null
                      return (
                        <View key={tx.transaction_id} style={s.txRow}>
                          <View style={s.txLeft}>
                            <Text style={s.txEmoji}>{emoji}</Text>
                            <View style={s.txMid}>
                              <Text style={s.txDetail} numberOfLines={1}>
                                {tx.detail.length > 32 ? tx.detail.slice(0, 31) + "…" : tx.detail}
                              </Text>
                              <View style={s.txMeta}>
                                {tx.date && (
                                  <Text style={s.txDate}>{tx.date}</Text>
                                )}
                                {tx.budget_category && (
                                  <Text style={s.txCat}>{tx.budget_category}</Text>
                                )}
                                {bankTag && (
                                  <Text style={s.txBank}>{bankTag}</Text>
                                )}
                              </View>
                            </View>
                          </View>
                          <Text style={[s.txAmount, { color: isDebit ? RED : GREEN }]}>
                            {isDebit ? "-" : "+"}{fmt(tx.amount)}
                          </Text>
                        </View>
                      )
                    })}

                    {searchResults.transactions.length < searchResults.total && (
                      <TouchableOpacity
                        style={s.loadMoreBtn}
                        onPress={() => setSearchLimit(prev => prev + SEARCH_PAGE_SIZE)}
                        activeOpacity={0.7}
                      >
                        <Text style={s.loadMoreText}>
                          Cargar más ({searchResults.total - searchResults.transactions.length} restantes)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {!searchLoading && !committed && (
                  <Text style={s.searchHint}>
                    Escribe un comercio, selecciona filtros y toca Buscar.
                  </Text>
                )}
              </View>
            )}
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

  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  logoChip:  { width: 28, height: 28, borderRadius: 8, backgroundColor: INDIGO, alignItems: "center", justifyContent: "center" },
  logoText:  { color: "#fff", fontSize: 14, fontWeight: "800" },
  logoLabel: { color: TEXT, fontSize: 15, fontWeight: "700", letterSpacing: 1.5 },
  greeting:  { color: TEXT, fontSize: 24, fontWeight: "700" },
  headerSub: { color: MUTED, fontSize: 14, marginTop: 3 },

  pillRow:      { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  monthScroll:  { paddingBottom: 8 },
  monthContent: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  pillOn:       { backgroundColor: INDIGO, borderColor: INDIGO },
  pillText:     { color: MUTED, fontSize: 13, fontWeight: "600" },
  pillTextOn:   { color: "#fff" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  kpiCard: { backgroundColor: CARD, borderRadius: 12, padding: 16, width: "47%", borderWidth: 1, borderColor: BORDER, borderTopWidth: 2 },
  kpiLabel: { fontSize: 10, color: MUTED, fontWeight: "700", letterSpacing: 1.2 },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 6 },

  card: { backgroundColor: CARD, marginHorizontal: 12, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 10, letterSpacing: 0.3 },
  legend:       { fontSize: 12, color: MUTED, marginBottom: 10 },

  pieRow:    { flexDirection: "row", alignItems: "center", gap: 14 },
  pieRight:  { flex: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  legendName:{ flex: 1, color: MUTED, fontSize: 12 },
  legendAmt: { color: TEXT, fontSize: 12, fontWeight: "600" },

  recRow:    { flexDirection: "row", gap: 10, marginBottom: 10 },
  recBullet: { fontSize: 16 },
  recText:   { flex: 1, color: MUTED, fontSize: 13, lineHeight: 20 },

  empty:      { alignItems: "center", padding: 56 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22, fontSize: 14 },

  // ── Search section ──────────────────────────────────────────────────────────
  searchSection: {
    marginHorizontal: 12, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD, overflow: "hidden",
  },
  searchHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  searchHeaderText: { color: TEXT, fontSize: 14, fontWeight: "700" },
  searchChevron:    { color: MUTED, fontSize: 18, fontWeight: "700" },

  searchBody: { paddingHorizontal: 14, paddingBottom: 16 },

  searchInput: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: TEXT, fontSize: 14, marginBottom: 12,
  },

  searchFilterLabel: {
    color: MUTED, fontSize: 11, fontWeight: "700",
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  searchPillRow: { gap: 6, paddingBottom: 4, paddingRight: 8 },
  searchPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, backgroundColor: BG,
  },
  searchPillOn:   { backgroundColor: INDIGO, borderColor: INDIGO },
  searchPillText:   { color: MUTED, fontSize: 12, fontWeight: "600" },
  searchPillTextOn: { color: "#fff" },

  searchBtn: {
    backgroundColor: INDIGO, borderRadius: 10,
    paddingVertical: 11, alignItems: "center", marginTop: 14,
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  searchHint: {
    color: DIM, fontSize: 13, textAlign: "center",
    paddingVertical: 20, lineHeight: 20,
  },

  searchResultsHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginTop: 14, marginBottom: 8,
  },
  searchResultsCount:   { color: TEXT,  fontSize: 13, fontWeight: "700" },
  searchResultsShowing: { color: MUTED, fontSize: 12 },

  // Transaction rows
  txRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  txLeft:   { flexDirection: "row", alignItems: "center", flex: 1, gap: 10, marginRight: 10 },
  txEmoji:  { fontSize: 20, width: 28, textAlign: "center" },
  txMid:    { flex: 1 },
  txDetail: { color: TEXT, fontSize: 13, fontWeight: "600" },
  txMeta:   { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  txDate:   { color: DIM,  fontSize: 11 },
  txCat:    { color: MUTED, fontSize: 11 },
  txBank:   {
    color: INDIGO, fontSize: 11, fontWeight: "700",
    backgroundColor: "rgba(99,102,241,0.12)", borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  txAmount: { fontSize: 13, fontWeight: "700" },

  loadMoreBtn: {
    marginTop: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, alignItems: "center",
  },
  loadMoreText: { color: INDIGO, fontSize: 13, fontWeight: "600" },
})
