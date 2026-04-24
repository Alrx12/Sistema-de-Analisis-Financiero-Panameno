/**
 * SnapshotDetailScreen — Detalle de un análisis (snapshot)
 * Ruta: /(tabs)/snapshot/[id]
 * Muestra: KPIs, recomendaciones, desglose de categorías y transacciones.
 * Tema: dark navy
 */
import { useState } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, FlatList,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAnalysis, getTransactions, getConfidenceStats } from "@safpro/api/analysis"
import type { Transaction } from "@safpro/types"

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

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" })
}

// ── Emojis por categoría ──────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  alimentacion: "🛒", supermercado: "🛒", mercado: "🛒",
  restaurantes: "🍽️", cafe: "☕",
  transporte: "🚗", gasolina: "⛽",
  servicios: "💡", agua: "💧", luz: "💡",
  internet: "📶", telefono: "📱",
  entretenimiento: "🎮", streaming: "📺",
  salud: "🏥",  educacion: "📚",
  alquiler: "🏠", hogar: "🏠",
  tecnologia: "💻", suscripciones: "🔔",
  mascotas: "🐾", ropa: "👕", deporte: "⚽",
  viajes: "✈️", bares: "🍺",
  ahorro: "🐖", inversion: "📈",
  deudas: "💳", cargo_financiero: "🏦",
  comisiones: "💰", impuestos: "📋",
  transferencias: "↔️", otros: "📦",
}

// ── Recommendation badge colors ───────────────────────────────────────────────
const REC_COLORS = {
  critical: { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  text: "#fca5a5", icon: "alert-circle" },
  warning:  { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", text: "#fcd34d", icon: "warning" },
  info:     { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.3)", text: "#a5b4fc", icon: "information-circle" },
  success:  { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",  text: "#86efac", icon: "checkmark-circle" },
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SnapshotDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const [tab, setTab] = useState<"overview" | "transactions" | "calidad">("overview")
  const [search, setSearch] = useState("")

  const { data: snapshot, isLoading: loadingSnap } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getAnalysis(id),
    enabled: !!id,
  })

  const { data: txs, isLoading: loadingTxs } = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => getTransactions(id),
    enabled: !!id && tab === "transactions",
  })

  const { data: confStats, isLoading: loadingConf } = useQuery({
    queryKey: ["confidence-stats", id],
    queryFn: () => getConfidenceStats(id!),
    enabled: !!id && tab === "calidad",
  })

  const filteredTxs = (txs ?? []).filter((t) =>
    search.length === 0 ||
    t.detail.toLowerCase().includes(search.toLowerCase()) ||
    (t.budget_category ?? "").toLowerCase().includes(search.toLowerCase())
  )

  if (loadingSnap) {
    return (
      <SafeAreaView style={s.safe} edges={["bottom"]}>
        <ActivityIndicator color={INDIGO} style={{ marginTop: 80 }} size="large" />
      </SafeAreaView>
    )
  }

  if (!snapshot) {
    return (
      <SafeAreaView style={s.safe} edges={["bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: MUTED }}>Análisis no encontrado.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: INDIGO }}>← Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const categories = Object.entries(snapshot.categories).sort((a, b) => b[1] - a[1])
  const totalCat   = categories.reduce((sum, [, v]) => sum + v, 0) || 1

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={MUTED} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerBank} numberOfLines={1}>
            {snapshot.bank_account
              ? `${snapshot.bank_account.bank_name} ····${snapshot.bank_account.account_last4}`
              : "Sin cuenta"}
          </Text>
          <Text style={s.headerPeriod}>
            {formatDate(snapshot.period_start)} — {formatDate(snapshot.period_end)}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {([
          { key: "overview",      label: "Resumen" },
          { key: "calidad",       label: "Calidad" },
          { key: "transactions",  label: `Txs (${snapshot.total_transactions})` },
        ] as const).map(({ key: t, label }) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.75}
          >
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "calidad" ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          {loadingConf ? (
            <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
          ) : confStats ? (
            <>
              {/* Confianza promedio */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Confianza promedio</Text>
                <View style={s.confRow}>
                  <Text style={s.confPctText}>
                    {Math.round(confStats.avg_confidence * 100)}%
                  </Text>
                  <View style={s.confBarOuter}>
                    <View
                      style={[
                        s.confBarFill,
                        {
                          width: `${Math.round(confStats.avg_confidence * 100)}%` as `${number}%`,
                          backgroundColor:
                            confStats.avg_confidence >= 0.85 ? GREEN :
                            confStats.avg_confidence >= 0.65 ? "#f59e0b" : RED,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={s.confHint}>
                  {confStats.avg_confidence >= 0.85
                    ? "✅ Excelente — el sistema categoriza con alta precisión."
                    : confStats.avg_confidence >= 0.65
                    ? "⚠️ Aceptable — hay margen de mejora con entrenamiento."
                    : "🔴 Baja confianza — se recomienda entrenar el sistema."}
                </Text>
              </View>

              {/* KPIs de revisión */}
              <View style={s.kpiRow}>
                <View style={[s.kpiCard, { borderTopColor: confStats.requires_review_count > 0 ? "#f59e0b" : GREEN }]}>
                  <Text style={s.kpiLabel}>REQUIEREN REVISIÓN</Text>
                  <Text style={[s.kpiValue, { color: confStats.requires_review_count > 0 ? "#f59e0b" : GREEN }]}>
                    {confStats.requires_review_count}
                  </Text>
                  <Text style={s.kpiSub}>{confStats.requires_review_pct.toFixed(1)}% del total</Text>
                </View>
                <View style={[s.kpiCard, { borderTopColor: confStats.fallback_count > 0 ? RED : GREEN }]}>
                  <Text style={s.kpiLabel}>FALLBACK</Text>
                  <Text style={[s.kpiValue, { color: confStats.fallback_count > 0 ? RED : GREEN }]}>
                    {confStats.fallback_count}
                  </Text>
                  <Text style={s.kpiSub}>{confStats.fallback_pct.toFixed(1)}% del total</Text>
                </View>
              </View>

              {/* Por método */}
              {Object.keys(confStats.by_method).length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Por método de clasificación</Text>
                  {Object.entries(confStats.by_method)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => {
                      const pct = Math.round((count / confStats.total) * 100)
                      const label = method
                        .replace("kb_personal", "KB Personal")
                        .replace("kb_global", "KB Global")
                        .replace("builtin", "Regla incorporada")
                        .replace("fallback", "Fallback")
                        .replace("pattern_personal", "Patrón personal")
                        .replace("pattern_global", "Patrón global")
                      return (
                        <View key={method} style={s.methodRow}>
                          <View style={{ flex: 1 }}>
                            <View style={s.methodHeader}>
                              <Text style={s.methodLabel}>{label}</Text>
                              <Text style={s.methodCount}>{count} · {pct}%</Text>
                            </View>
                            <View style={s.catBar}>
                              <View
                                style={[
                                  s.catBarFill,
                                  {
                                    width: `${pct}%` as `${number}%`,
                                    backgroundColor:
                                      method === "fallback" ? RED :
                                      method.startsWith("kb") ? GREEN : INDIGO,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        </View>
                      )
                    })}
                </View>
              )}

              {/* CTA a Entrenamiento */}
              {confStats.fallback_count > 0 && (
                <View style={s.ctaBanner}>
                  <Ionicons name="sparkles-outline" size={18} color="#fbbf24" />
                  <Text style={s.ctaBannerText}>
                    Hay {confStats.fallback_count} transacciones sin clasificar. Entrena el sistema en la pantalla de Entrenamiento.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ color: MUTED }}>No hay datos de calidad disponibles.</Text>
            </View>
          )}
        </ScrollView>
      ) : tab === "overview" ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          {/* KPIs */}
          <View style={s.kpiRow}>
            {[
              { label: "INGRESOS",  value: formatCurrency(snapshot.total_income),   color: GREEN },
              { label: "GASTOS",    value: formatCurrency(snapshot.total_expenses),  color: RED },
              { label: "BALANCE",   value: formatCurrency(snapshot.balance),          color: snapshot.balance >= 0 ? "#3b82f6" : "#f97316" },
            ].map(({ label, value, color }) => (
              <View key={label} style={[s.kpiCard, { borderTopColor: color }]}>
                <Text style={s.kpiLabel}>{label}</Text>
                <Text style={[s.kpiValue, { color }]}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Recomendaciones */}
          {snapshot.recommendations.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Recomendaciones</Text>
              {snapshot.recommendations.map((rec, i) => {
                const cfg = REC_COLORS[rec.type] ?? REC_COLORS.info
                return (
                  <View key={i} style={[s.recCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <Ionicons name={cfg.icon as any} size={16} color={cfg.text} style={{ marginTop: 1 }} />
                    <Text style={[s.recText, { color: cfg.text }]}>{rec.message}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* Categorías */}
          {categories.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Por categoría</Text>
              {categories.map(([cat, amount]) => {
                const pct = Math.round((amount / totalCat) * 100)
                return (
                  <View key={cat} style={s.catRow}>
                    <Text style={s.catEmoji}>{CAT_EMOJI[cat] ?? "📦"}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={s.catHeader}>
                        <Text style={s.catName}>{cat.replace(/_/g, " ")}</Text>
                        <Text style={s.catAmount}>{formatCurrency(amount)}</Text>
                      </View>
                      <View style={s.catBar}>
                        <View style={[s.catBarFill, { width: `${pct}%` as `${number}%` }]} />
                      </View>
                    </View>
                    <Text style={s.catPct}>{pct}%</Text>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Botón pantalla completa con reclasificación */}
          <TouchableOpacity
            style={s.fullTxBtn}
            onPress={() => router.push({ pathname: "/(tabs)/transactions/[id]", params: { id } })}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={14} color="#a5b4fc" />
            <Text style={s.fullTxBtnText}>Abrir vista completa con filtros y reclasificación</Text>
            <Ionicons name="chevron-forward" size={14} color="#a5b4fc" />
          </TouchableOpacity>

          {/* Search */}
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={16} color={DIM} style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar transacción…"
              placeholderTextColor={DIM as string}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={DIM} />
              </TouchableOpacity>
            )}
          </View>

          {loadingTxs ? (
            <ActivityIndicator color={INDIGO} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredTxs}
              keyExtractor={(t) => t.transaction_id}
              contentContainerStyle={s.txList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: t }) => (
                <View style={s.txRow}>
                  <View style={s.txIconWrap}>
                    <Text style={s.txEmoji}>{CAT_EMOJI[t.budget_category ?? ""] ?? "📦"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txDetail} numberOfLines={1}>{t.detail}</Text>
                    <Text style={s.txMeta}>
                      {t.date}
                      {t.budget_category ? ` · ${t.budget_category.replace(/_/g, " ")}` : ""}
                    </Text>
                  </View>
                  <Text style={[s.txAmount, { color: t.movement_type === "debito" ? RED : GREEN }]}>
                    {t.movement_type === "debito" ? "-" : "+"}{formatCurrency(t.amount)}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", padding: 40 }}>
                  <Text style={{ color: MUTED }}>Sin transacciones{search ? " encontradas" : ""}.</Text>
                </View>
              }
            />
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  fullTxBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.1)", margin: 12, borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
  },
  fullTxBtnText: { color: "#a5b4fc", fontSize: 13, fontWeight: "600", flex: 1, textAlign: "center" },

  header: {
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn:      { padding: 4 },
  headerBank:   { color: TEXT,  fontSize: 15, fontWeight: "700" },
  headerPeriod: { color: MUTED, fontSize: 12, marginTop: 2 },

  tabRow: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive:     { borderBottomColor: INDIGO },
  tabBtnText:       { color: MUTED, fontSize: 13, fontWeight: "600" },
  tabBtnTextActive: { color: TEXT },

  scrollContent: { padding: 12, gap: 12 },

  // KPIs
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER, borderTopWidth: 2,
  },
  kpiLabel: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  kpiValue: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  kpiSub:   { color: DIM as string, fontSize: 10, marginTop: 2 },

  // Calidad tab
  confRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  confPctText: { color: TEXT, fontSize: 28, fontWeight: "800", minWidth: 72 },
  confBarOuter: {
    flex: 1, height: 10, backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 5, overflow: "hidden",
  },
  confBarFill: { height: "100%", borderRadius: 5 },
  confHint: { color: MUTED, fontSize: 12, lineHeight: 17 },
  methodRow: { marginBottom: 10 },
  methodHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  methodLabel: { color: TEXT, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  methodCount: { color: MUTED, fontSize: 12 },
  ctaBanner: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(251,191,36,0.08)",
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.2)",
  },
  ctaBannerText: { color: "#fcd34d", fontSize: 13, flex: 1, lineHeight: 18 },

  // Section
  section: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  sectionTitle: {
    color: MUTED, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4,
  },

  // Recommendations
  recCard: {
    flexDirection: "row", gap: 10, padding: 10,
    borderRadius: 8, borderWidth: 1, alignItems: "flex-start",
  },
  recText: { fontSize: 13, lineHeight: 18, flex: 1 },

  // Categories
  catRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  catEmoji:  { fontSize: 18, width: 24, textAlign: "center" },
  catHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName:   { color: TEXT, fontSize: 13, fontWeight: "600", textTransform: "capitalize", flex: 1 },
  catAmount: { color: MUTED, fontSize: 12 },
  catBar:    { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  catBarFill:{ height: "100%", backgroundColor: INDIGO, borderRadius: 2 },
  catPct:    { color: DIM as string, fontSize: 11, width: 32, textAlign: "right" },

  // Search
  searchBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD, margin: 10, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 14 },

  // Transactions
  txList:    { paddingHorizontal: 10, paddingBottom: 16 },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  txIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  txEmoji:  { fontSize: 16 },
  txDetail: { color: TEXT,  fontSize: 13, fontWeight: "600" },
  txMeta:   { color: MUTED, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  txAmount: { fontSize: 13, fontWeight: "700" },
})
