/**
 * KBScreen — Knowledge Base (solo administrador)
 * Ruta: /(tabs)/kb
 * Muestra las entradas del KB personal y global con KPIs y badges por tipo.
 */
import { useState } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getMe } from "@safpro/api/users"
import { listKB, listGlobalKB, deleteKBEntry } from "@safpro/api/kb"
import type { KBEntry } from "@safpro/types"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const RED    = "#ef4444"
const GREEN  = "#22c55e"
const AMBER  = "#fbbf24"

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, iconName, iconColor }: {
  label: string; value: number | string; sub: string
  iconName: string; iconColor: string
}) {
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={iconName as any} size={16} color={iconColor} />
      </View>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  )
}

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, onDelete, canDelete, deleting }: {
  entry: KBEntry
  onDelete?: (key: string) => void
  canDelete?: boolean
  deleting?: boolean
}) {
  const isPattern = entry.entry_type === "pattern"
  const meta = [entry.budget_category, entry.economic_type, entry.budget_role]
    .filter(Boolean)
    .join(" · ")

  return (
    <View style={s.entryCard}>
      <View style={s.entryLeft}>
        <View style={s.entryKeyRow}>
          <Text style={s.entryKey} numberOfLines={1}>{entry.key}</Text>
          <View style={[s.typeBadge, isPattern ? s.typeBadgePattern : s.typeBadgeExact]}>
            <Text style={[s.typeBadgeText, isPattern ? s.typeBadgeTextPattern : s.typeBadgeTextExact]}>
              {isPattern ? "patrón" : "exact"}
            </Text>
          </View>
        </View>
        {meta ? (
          <Text style={s.entryMeta} numberOfLines={1}>{meta}</Text>
        ) : null}
        {entry.economic_type_detail ? (
          <Text style={s.entryDetail} numberOfLines={1}>
            {entry.economic_type_detail}
          </Text>
        ) : null}
      </View>
      {canDelete && (
        <TouchableOpacity
          onPress={() => onDelete?.(entry.key)}
          style={s.deleteBtn}
          activeOpacity={0.7}
          disabled={deleting}
        >
          <Ionicons
            name="trash-outline"
            size={17}
            color={deleting ? MUTED : RED}
          />
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function KBScreen() {
  const [tab, setTab] = useState<"personal" | "global">("personal")
  const [filter, setFilter] = useState<"all" | "exact" | "pattern">("all")
  const qc = useQueryClient()

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  })

  const isAdmin = user?.is_admin === true

  const { data: personal, isLoading: loadingPersonal } = useQuery({
    queryKey: ["kb-personal"],
    queryFn: listKB,
    enabled: isAdmin,
  })

  const { data: globalData, isLoading: loadingGlobal } = useQuery({
    queryKey: ["kb-global"],
    queryFn: listGlobalKB,
    enabled: isAdmin && tab === "global",
  })

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteKBEntry(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-personal"] }),
  })

  // ── Loading del usuario ────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator color={INDIGO} style={{ marginTop: 80 }} size="large" />
      </SafeAreaView>
    )
  }

  // ── Acceso denegado ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.gateContainer}>
          <Ionicons name="lock-closed" size={52} color={MUTED} style={{ marginBottom: 16 }} />
          <Text style={s.gateTitle}>Acceso restringido</Text>
          <Text style={s.gateSub}>
            Solo los administradores pueden ver el Knowledge Base.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Datos según tab ────────────────────────────────────────────────────────
  const rawEntries = tab === "personal"
    ? (personal?.entries ?? [])
    : (globalData?.entries ?? [])

  const isLoading = tab === "personal" ? loadingPersonal : loadingGlobal

  // Filtrar por tipo
  const entries = filter === "all"
    ? rawEntries
    : rawEntries.filter(e => e.entry_type === filter)

  function confirmDelete(key: string) {
    Alert.alert(
      "Eliminar entrada",
      `¿Eliminar "${key}" del KB personal?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => deleteMut.mutate(key),
        },
      ]
    )
  }

  const personalExact = personal?.entries?.filter(e => e.entry_type === "exact").length ?? 0
  const personalPatterns = personal?.patterns_count ?? 0
  const corrections = personal?.corrections_count ?? 0
  const globalCount = (personal?.global_exact_matches_count ?? 0) + (personal?.global_patterns_count ?? 0)

  const globalEntries = globalData?.entries?.length ?? 0

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.title}>Knowledge Base</Text>
            <View style={s.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={AMBER} />
              <Text style={s.adminBadgeText}>Admin</Text>
            </View>
          </View>
          <Text style={s.subtitle}>Lo que el sistema ha aprendido de tus correcciones</Text>
        </View>

        {/* KPI row */}
        {!loadingPersonal && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.kpiRow}
          >
            <KpiCard
              label="Entradas Personales"
              value={personalExact}
              sub="exact matches aprendidos"
              iconName="bookmark-outline"
              iconColor={INDIGO}
            />
            <KpiCard
              label="Patrones Personales"
              value={personalPatterns}
              sub="reglas regex activas"
              iconName="flash-outline"
              iconColor={ORANGE}
            />
            <KpiCard
              label="Correcciones Totales"
              value={corrections}
              sub="veces que entrenaste el sistema"
              iconName="book-outline"
              iconColor={GREEN}
            />
            <KpiCard
              label="KB Global"
              value={globalCount}
              sub="entradas + patrones compartidos"
              iconName="globe-outline"
              iconColor="#22d3ee"
            />
          </ScrollView>
        )}

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === "personal" && s.tabBtnActive]}
            onPress={() => { setTab("personal"); setFilter("all") }}
            activeOpacity={0.75}
          >
            <Text style={[s.tabText, tab === "personal" && s.tabTextActive]}>
              Personal ({personal?.entries?.length ?? 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "global" && s.tabBtnActive]}
            onPress={() => { setTab("global"); setFilter("all") }}
            activeOpacity={0.75}
          >
            <Text style={[s.tabText, tab === "global" && s.tabTextActive]}>
              Global ({globalEntries || "..."})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter pills */}
        {rawEntries.length > 0 && (
          <View style={s.filterRow}>
            {(["all", "exact", "pattern"] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[s.pill, filter === f && s.pillActive]}
                onPress={() => setFilter(f)}
                activeOpacity={0.75}
              >
                <Text style={[s.pillText, filter === f && s.pillTextActive]}>
                  {f === "all" ? "Todos" : f === "exact" ? "Exact match" : "Patrones"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Info banner para el global */}
        {tab === "global" && !isLoading && (
          <View style={s.infoBanner}>
            <Ionicons name="information-circle-outline" size={16} color="#93afd4" />
            <Text style={s.infoBannerText}>
              El KB global es de solo lectura y se comparte entre todos los usuarios.
            </Text>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
        ) : entries.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons name="library-outline" size={44} color={MUTED} style={{ marginBottom: 12 }} />
            <Text style={s.emptyText}>
              {tab === "personal"
                ? filter !== "all"
                  ? `No hay entradas de tipo "${filter}" en el KB personal.`
                  : "KB personal vacío — empieza entrenando transacciones."
                : "KB global sin entradas."}
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            <Text style={s.listCount}>
              {entries.length} de {rawEntries.length} entradas
            </Text>
            {entries.map((entry) => (
              <EntryCard
                key={`${entry.entry_type}-${entry.key}`}
                entry={entry}
                onDelete={tab === "personal" ? confirmDelete : undefined}
                canDelete={tab === "personal"}
                deleting={deleteMut.isPending}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // Gate
  gateContainer: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 40,
  },
  gateTitle: {
    color: TEXT, fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 10,
  },
  gateSub: {
    color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20,
  },

  // Header
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title:     { color: TEXT, fontSize: 22, fontWeight: "700" },
  subtitle:  { color: "#93afd4", fontSize: 13 },
  adminBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(251,191,36,0.12)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.25)",
  },
  adminBadgeText: { color: AMBER, fontSize: 11, fontWeight: "700" },

  // KPI row
  kpiRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  kpiCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 14, width: 150,
    borderWidth: 1, borderColor: BORDER,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { color: MUTED, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  kpiValue: { color: TEXT, fontSize: 26, fontWeight: "700", marginBottom: 2 },
  kpiSub:   { color: DIM as string, fontSize: 11, lineHeight: 14 },

  // Tabs
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
  tabBtnActive: { borderBottomColor: INDIGO },
  tabText:      { color: MUTED, fontSize: 13, fontWeight: "600" },
  tabTextActive:{ color: TEXT },

  // Filter pills
  filterRow: {
    flexDirection: "row", padding: 12, gap: 8,
  },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: BORDER,
  },
  pillActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  pillText:   { color: MUTED, fontSize: 12, fontWeight: "600" },
  pillTextActive: { color: "#fff" },

  // Empty
  emptyContainer: {
    alignItems: "center", justifyContent: "center", padding: 40, paddingTop: 60,
  },
  emptyText: {
    color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20,
  },

  // Info banner
  infoBanner: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: "rgba(99,102,241,0.08)",
    margin: 12, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.15)",
  },
  infoBannerText: { color: "#93afd4", fontSize: 13, flex: 1, lineHeight: 18 },

  // List
  list: { padding: 12, paddingBottom: 32 },
  listCount: { color: MUTED, fontSize: 12, marginBottom: 8 },

  // Entry card
  entryCard: {
    backgroundColor: CARD,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 6,
  },
  entryLeft:   { flex: 1 },
  entryKeyRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 },
  entryKey:    { color: TEXT, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  entryMeta:   { color: MUTED, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  entryDetail: { color: DIM as string, fontSize: 11, marginTop: 1, textTransform: "capitalize" },
  deleteBtn:   { padding: 6, marginLeft: 8 },

  // Type badge
  typeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
  },
  typeBadgeExact: {
    backgroundColor: "rgba(99,102,241,0.15)", borderWidth: 1, borderColor: "rgba(99,102,241,0.3)",
  },
  typeBadgePattern: {
    backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)",
  },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  typeBadgeTextExact:   { color: "#818cf8" },
  typeBadgeTextPattern: { color: "#f59e0b" },
})
