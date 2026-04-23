/**
 * KBScreen — Knowledge Base (solo administrador)
 * Ruta: /(tabs)/kb
 * Muestra las entradas del KB personal y global.
 * Solo accesible si user.is_admin === true.
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const RED    = "#ef4444"
const GREEN  = "#22c55e"

// ── Main screen ───────────────────────────────────────────────────────────────
export default function KBScreen() {
  const [tab, setTab] = useState<"personal" | "global">("personal")
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

  const { data: global, isLoading: loadingGlobal } = useQuery({
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

  // ── Datos activos ──────────────────────────────────────────────────────────
  const entries   = tab === "personal" ? (personal ?? []) : (global ?? [])
  const isLoading = tab === "personal" ? loadingPersonal : loadingGlobal

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

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.title}>Knowledge Base</Text>
          <View style={s.adminBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#fbbf24" />
            <Text style={s.adminBadgeText}>Admin</Text>
          </View>
        </View>
        <Text style={s.subtitle}>
          {tab === "personal"
            ? `${personal?.length ?? 0} entradas personales`
            : `${global?.length ?? 0} entradas globales`}
        </Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(["personal", "global"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.75}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === "personal" ? "Personal" : "Global"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
      ) : entries.length === 0 ? (
        <View style={s.emptyContainer}>
          <Ionicons name="library-outline" size={44} color={MUTED} style={{ marginBottom: 12 }} />
          <Text style={s.emptyText}>
            {tab === "personal"
              ? "KB personal vacío — empieza entrenando transacciones."
              : "KB global sin entradas."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {/* Info banner para el global */}
          {tab === "global" && (
            <View style={s.infoBanner}>
              <Ionicons name="information-circle-outline" size={16} color="#93afd4" />
              <Text style={s.infoBannerText}>
                El KB global es de solo lectura y se comparte entre todos los usuarios.
              </Text>
            </View>
          )}

          {entries.map((entry) => {
            const meta = [entry.budget_category, entry.economic_type, entry.budget_role]
              .filter(Boolean)
              .join(" · ")
            return (
              <View key={entry.key} style={s.entryCard}>
                <View style={s.entryLeft}>
                  <Text style={s.entryKey} numberOfLines={1}>{entry.key}</Text>
                  {meta ? (
                    <Text style={s.entryMeta} numberOfLines={1}>{meta}</Text>
                  ) : null}
                  {entry.economic_type_detail ? (
                    <Text style={s.entryDetail} numberOfLines={1}>
                      {entry.economic_type_detail}
                    </Text>
                  ) : null}
                </View>
                {tab === "personal" && (
                  <TouchableOpacity
                    onPress={() => confirmDelete(entry.key)}
                    style={s.deleteBtn}
                    activeOpacity={0.7}
                    disabled={deleteMut.isPending}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={deleteMut.isPending ? MUTED : RED}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
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
  adminBadgeText: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },

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

  // Empty
  emptyContainer: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 40,
  },
  emptyText: {
    color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20,
  },

  // Info banner
  infoBanner: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.15)",
  },
  infoBannerText: { color: "#93afd4", fontSize: 13, flex: 1, lineHeight: 18 },

  // List
  list: { padding: 12, gap: 6, paddingBottom: 32 },
  entryCard: {
    backgroundColor: CARD,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  entryLeft:   { flex: 1 },
  entryKey:    { color: TEXT, fontSize: 14, fontWeight: "700" },
  entryMeta:   { color: MUTED, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  entryDetail: { color: DIM as string, fontSize: 11, marginTop: 1, textTransform: "capitalize" },
  deleteBtn:   { padding: 6, marginLeft: 8 },
})
