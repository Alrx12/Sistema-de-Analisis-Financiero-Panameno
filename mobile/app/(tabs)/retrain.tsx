/**
 * RetrainScreen — Entrenamiento masivo (mobile)
 * Tema: dark navy
 */
import { useState, useCallback, useEffect } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, FlatList,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getReviewGroups, applyReviewGroup } from "@safpro/api/transactions"
import type { ReviewGroup } from "@safpro/types"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = "#070c18"
const CARD     = "#0d1426"
const CARD2    = "#111827"
const BORDER   = "rgba(255,255,255,0.07)"
const TEXT     = "#f1f5f9"
const MUTED    = "rgba(255,255,255,0.45)"
const DIM      = "rgba(255,255,255,0.28)"
const INDIGO   = "#6366f1"
const ORANGE   = "#e05c19"

const BUDGET_CATEGORIES = [
  "alimentacion","restaurantes","supermercado","transporte","gasolina",
  "salud","educacion","entretenimiento","suscripciones","ropa",
  "hogar","servicios","tecnologia","viajes","deudas",
  "transferencias","comisiones","impuestos","ahorro","inversion",
  "cargo_financiero","otros",
]

const ROLES = [
  { value: "presupuestable",    label: "Presupuestable" },
  { value: "no_presupuestable", label: "No presupuestable" },
  { value: "gasto_operativo",   label: "Gasto operativo" },
  { value: "gasto_financiero",  label: "Gasto financiero" },
  { value: "ahorro_inversion",  label: "Ahorro / Inversión" },
]

const SUBTYPES = [
  { value: "extraordinario", label: "Extraordinario" },
  { value: "recurrente",     label: "Recurrente" },
  { value: "variable",       label: "Variable" },
  { value: "financiero",     label: "Financiero" },
]

function defaultRole(cat: string): string {
  if (["cargo_financiero","deudas"].includes(cat))                          return "gasto_financiero"
  if (["ahorro","inversion"].includes(cat))                                 return "ahorro_inversion"
  if (["alquiler","supermercado","servicios","salud","educacion"].includes(cat)) return "presupuestable"
  if (["transporte","gasolina"].includes(cat))                              return "gasto_operativo"
  return "no_presupuestable"
}

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Picker modal ──────────────────────────────────────────────────────────────
function PickerModal({ visible, options, selected, onSelect, onClose, title }: {
  visible: boolean
  options: { value: string; label: string }[]
  selected: string
  onSelect: (v: string) => void
  onClose: () => void
  title: string
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalItem, selected === item.value && styles.modalItemSelected]}
                onPress={() => { onSelect(item.value); onClose() }}
              >
                <Text style={[styles.modalItemText, selected === item.value && { color: INDIGO, fontWeight: "700" }]}>
                  {item.label.charAt(0).toUpperCase() + item.label.slice(1).replace(/_/g, " ")}
                </Text>
                {selected === item.value && (
                  <Ionicons name="checkmark" size={18} color={INDIGO} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Tarjeta de grupo ──────────────────────────────────────────────────────────
function GroupCard({ group, index, total, onApplied, onSkipped }: {
  group: ReviewGroup
  index: number
  total: number
  onApplied: (key: string, count: number) => void
  onSkipped: (key: string) => void
}) {
  const [category, setCategory]               = useState(group.current_category ?? "")
  const [role, setRole]                       = useState(
    group.current_budget_role && group.current_budget_role !== "revisar" ? group.current_budget_role : ""
  )
  const [subtype, setSubtype]                 = useState("recurrente")
  const [showCatPicker, setShowCatPicker]     = useState(false)
  const [showRolePicker, setShowRolePicker]   = useState(false)
  const [showSubtypePicker, setShowSubtypePicker] = useState(false)
  const [applying, setApplying]               = useState(false)

  const canApply = category !== "" && role !== ""

  async function handleApply() {
    if (!canApply) return
    setApplying(true)
    try {
      const res = await applyReviewGroup({
        canonical_key: group.canonical_key,
        transaction_ids: group.transaction_ids,
        sample_detail: group.sample_detail,
        economic_type: "gasto",
        economic_type_detail: null,
        subtype_economic: subtype,
        budget_category: category,
        budget_role: role,
        also_learn: true,
        force_personal: false,
        weight: 2.0,
      })
      onApplied(group.canonical_key, res.updated_count)
    } catch {
      setApplying(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardCounter}>{index + 1} / {total}</Text>
      <Text style={styles.merchantName}>{group.canonical_key}</Text>
      <Text style={styles.merchantDetail} numberOfLines={2}>{group.sample_detail}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>{group.count} transacciones</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: "rgba(224,92,25,0.15)" }]}>
          <Text style={[styles.statChipText, { color: ORANGE }]}>{formatCurrency(group.total_amount)}</Text>
        </View>
      </View>

      <View style={styles.selectorsGrid}>
        <TouchableOpacity style={styles.selector} onPress={() => setShowCatPicker(true)}>
          <Text style={styles.selectorLabel}>Categoría</Text>
          <Text style={[styles.selectorValue, !category && { color: DIM as string }]}>
            {category ? category.replace(/_/g, " ") : "Seleccionar…"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={DIM} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.selector} onPress={() => setShowSubtypePicker(true)}>
          <Text style={styles.selectorLabel}>Frecuencia</Text>
          <Text style={styles.selectorValue}>{SUBTYPES.find(s => s.value === subtype)?.label ?? subtype}</Text>
          <Ionicons name="chevron-down" size={14} color={DIM} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.selector, styles.selectorFull]} onPress={() => setShowRolePicker(true)}>
          <Text style={styles.selectorLabel}>Rol presupuesto</Text>
          <Text style={[styles.selectorValue, !role && { color: DIM as string }]}>
            {role ? (ROLES.find(r => r.value === role)?.label ?? role) : "Seleccionar…"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={DIM} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.skipBtn} onPress={() => onSkipped(group.canonical_key)}>
          <Ionicons name="play-skip-forward" size={18} color={MUTED} />
          <Text style={styles.skipBtnText}>Omitir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyBtn, (!canApply || applying) && { opacity: 0.5 }]}
          onPress={handleApply}
          disabled={!canApply || applying}
        >
          {applying
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text style={styles.applyBtnText}>{applying ? "Aplicando…" : "Aplicar"}</Text>
        </TouchableOpacity>
      </View>

      <PickerModal visible={showCatPicker}     options={BUDGET_CATEGORIES.map(c => ({ value: c, label: c }))} selected={category} onSelect={(v) => { setCategory(v); setRole(defaultRole(v)) }} onClose={() => setShowCatPicker(false)}     title="Categoría" />
      <PickerModal visible={showSubtypePicker} options={SUBTYPES}                                              selected={subtype}  onSelect={setSubtype}                                         onClose={() => setShowSubtypePicker(false)} title="Frecuencia" />
      <PickerModal visible={showRolePicker}    options={ROLES}                                                 selected={role}     onSelect={setRole}                                            onClose={() => setShowRolePicker(false)}    title="Rol de presupuesto" />
    </View>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function RetrainScreen() {
  const [appliedCount, setAppliedCount] = useState(0)
  const [removedKeys, setRemovedKeys]   = useState<Set<string>>(new Set())

  const { isLoading, data: reviewData } = useQuery({
    queryKey: ["review-groups"],
    queryFn: getReviewGroups,
  })

  const handleApplied = useCallback((key: string, count: number) => {
    setRemovedKeys(prev => new Set([...prev, key]))
    setAppliedCount(c => c + count)
  }, [])
  const handleSkipped = useCallback((key: string) => {
    setRemovedKeys(prev => new Set([...prev, key]))
  }, [])

  const allGroups = reviewData ?? []
  const pending   = allGroups.filter(g => !removedKeys.has(g.canonical_key))

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Entrenamiento</Text>
        <Text style={styles.subtitle}>
          {isLoading ? "Cargando…" : `${pending.length} grupos pendientes`}
        </Text>
      </View>

      {appliedCount > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {
            width: `${Math.round((appliedCount / (pending.length + appliedCount)) * 100)}%` as `${number}%`
          }]} />
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
      ) : pending.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          <Text style={styles.emptyTitle}>
            {appliedCount > 0 ? `¡Listo! ${appliedCount} txs entrenadas` : "Sin grupos pendientes"}
          </Text>
          <Text style={styles.emptyText}>
            {appliedCount > 0
              ? "El KB fue actualizado. Los próximos estados se clasificarán mejor."
              : "Todas tus transacciones tienen alta confianza."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GroupCard
            key={pending[0].canonical_key}
            group={pending[0]}
            index={0}
            total={pending.length}
            onApplied={handleApplied}
            onSkipped={handleSkipped}
          />
          {pending.length > 1 && (
            <View style={styles.queuePreview}>
              <Ionicons name="layers-outline" size={14} color={DIM} />
              <Text style={styles.queueText}>
                Siguiente: {pending[1].canonical_key} · {pending[1].count} txs
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title:    { color: TEXT,  fontSize: 22, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 3 },

  progressBar:  { height: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  progressFill: { height: "100%", backgroundColor: "#22c55e" },

  scroll: { padding: 16 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardCounter:    { fontSize: 11, color: DIM as string, fontWeight: "600", letterSpacing: 0.5, marginBottom: 8 },
  merchantName:   { fontSize: 20, fontWeight: "800", color: TEXT, marginBottom: 4 },
  merchantDetail: { fontSize: 13, color: MUTED, marginBottom: 14, lineHeight: 18 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  statChip: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  statChipText: { fontSize: 12, fontWeight: "600", color: TEXT },

  selectorsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  selector: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectorFull:        { minWidth: "100%" },
  selectorLabel:       { fontSize: 10, color: DIM as string, fontWeight: "600", marginRight: 4, letterSpacing: 0.3 },
  selectorValue:       { fontSize: 13, color: TEXT, fontWeight: "600", flex: 1, textTransform: "capitalize" },

  actionsRow: { flexDirection: "row", gap: 12 },
  skipBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  skipBtnText:  { color: MUTED, fontWeight: "600", fontSize: 14 },
  applyBtn: {
    flex: 2,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
    backgroundColor: INDIGO,
  },
  applyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  queuePreview:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" },
  queueText:     { color: DIM as string, fontSize: 12 },

  emptyState:   { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle:   { fontSize: 18, fontWeight: "700", color: TEXT, marginTop: 16, marginBottom: 8, textAlign: "center" },
  emptyText:    { color: MUTED, textAlign: "center", lineHeight: 22, fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingBottom: 40,
    maxHeight: "70%",
    borderTopWidth: 1, borderColor: BORDER,
  },
  modalTitle:            { fontSize: 16, fontWeight: "700", color: TEXT, paddingHorizontal: 20, marginBottom: 12 },
  modalItem:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalItemSelected:     { backgroundColor: "rgba(99,102,241,0.1)" },
  modalItemText:         { fontSize: 15, color: MUTED, textTransform: "capitalize" },
})
