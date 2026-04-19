/**
 * RetrainScreen — Entrenamiento masivo (mobile)
 * Muestra un grupo a la vez en tarjeta. Aplica o salta con botones.
 */
import { useState, useCallback } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, FlatList,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getReviewGroups, applyReviewGroup } from "@safpro/api/transactions"
import type { ReviewGroup } from "@safpro/types"

// ── Constantes ────────────────────────────────────────────────────────────────

const BUDGET_CATEGORIES = [
  "alimentacion", "restaurantes", "supermercado", "transporte", "gasolina",
  "salud", "educacion", "entretenimiento", "suscripciones", "ropa",
  "hogar", "servicios", "tecnologia", "viajes", "deudas",
  "transferencias", "comisiones", "impuestos", "ahorro", "inversion",
  "cargo_financiero", "otros",
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
  if (["cargo_financiero", "deudas"].includes(cat)) return "gasto_financiero"
  if (["ahorro", "inversion"].includes(cat))         return "ahorro_inversion"
  if (["alquiler", "supermercado", "servicios", "salud", "educacion"].includes(cat))
    return "presupuestable"
  if (["transporte", "gasolina"].includes(cat)) return "gasto_operativo"
  return "no_presupuestable"
}

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Picker modal ──────────────────────────────────────────────────────────────

function PickerModal({
  visible, options, selected, onSelect, onClose, title,
}: {
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
                <Text style={[
                  styles.modalItemText,
                  selected === item.value && styles.modalItemTextSelected,
                ]}>
                  {item.label.charAt(0).toUpperCase() + item.label.slice(1).replace(/_/g, " ")}
                </Text>
                {selected === item.value && (
                  <Ionicons name="checkmark" size={18} color="#e05c19" />
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

function GroupCard({
  group,
  index,
  total,
  onApplied,
  onSkipped,
}: {
  group: ReviewGroup
  index: number
  total: number
  onApplied: (key: string, count: number) => void
  onSkipped: (key: string) => void
}) {
  const [category, setCategory] = useState(group.current_category ?? "")
  const [role, setRole]         = useState(
    group.current_budget_role && group.current_budget_role !== "revisar"
      ? group.current_budget_role : ""
  )
  const [subtype, setSubtype]   = useState("recurrente")
  const [showCatPicker, setShowCatPicker]     = useState(false)
  const [showRolePicker, setShowRolePicker]   = useState(false)
  const [showSubtypePicker, setShowSubtypePicker] = useState(false)
  const [applying, setApplying] = useState(false)

  const catOptions = BUDGET_CATEGORIES.map(c => ({ value: c, label: c }))
  const canApply = category !== "" && role !== ""

  function handleCategorySelect(val: string) {
    setCategory(val)
    setRole(defaultRole(val))
  }

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
      {/* Contador */}
      <Text style={styles.cardCounter}>{index + 1} / {total}</Text>

      {/* Nombre del merchant */}
      <Text style={styles.merchantName}>{group.canonical_key}</Text>
      <Text style={styles.merchantDetail} numberOfLines={2}>{group.sample_detail}</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>{group.count} transacciones</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: "#fef3ec" }]}>
          <Text style={[styles.statChipText, { color: "#e05c19" }]}>
            {formatCurrency(group.total_amount)}
          </Text>
        </View>
      </View>

      {/* Selectores */}
      <View style={styles.selectorsGrid}>
        <TouchableOpacity style={styles.selector} onPress={() => setShowCatPicker(true)}>
          <Text style={styles.selectorLabel}>Categoría</Text>
          <Text style={[styles.selectorValue, !category && styles.selectorPlaceholder]}>
            {category ? category.replace(/_/g, " ") : "Seleccionar…"}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.selector} onPress={() => setShowSubtypePicker(true)}>
          <Text style={styles.selectorLabel}>Frecuencia</Text>
          <Text style={styles.selectorValue}>
            {SUBTYPES.find(s => s.value === subtype)?.label ?? subtype}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.selector, styles.selectorFull]}
          onPress={() => setShowRolePicker(true)}
        >
          <Text style={styles.selectorLabel}>Rol presupuesto</Text>
          <Text style={[styles.selectorValue, !role && styles.selectorPlaceholder]}>
            {role ? (ROLES.find(r => r.value === role)?.label ?? role) : "Seleccionar…"}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* Acciones */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => onSkipped(group.canonical_key)}
        >
          <Ionicons name="play-skip-forward" size={18} color="#6b7280" />
          <Text style={styles.skipBtnText}>Omitir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.applyBtn, (!canApply || applying) && styles.applyBtnDisabled]}
          onPress={handleApply}
          disabled={!canApply || applying}
        >
          {applying
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text style={styles.applyBtnText}>
            {applying ? "Aplicando…" : "Aplicar"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pickers */}
      <PickerModal
        visible={showCatPicker}
        options={catOptions}
        selected={category}
        onSelect={handleCategorySelect}
        onClose={() => setShowCatPicker(false)}
        title="Categoría"
      />
      <PickerModal
        visible={showSubtypePicker}
        options={SUBTYPES}
        selected={subtype}
        onSelect={setSubtype}
        onClose={() => setShowSubtypePicker(false)}
        title="Frecuencia"
      />
      <PickerModal
        visible={showRolePicker}
        options={ROLES}
        selected={role}
        onSelect={setRole}
        onClose={() => setShowRolePicker(false)}
        title="Rol de presupuesto"
      />
    </View>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function RetrainScreen() {
  const [appliedCount, setAppliedCount] = useState(0)
  const [groups, setGroups]             = useState<ReviewGroup[] | null>(null)

  const { isLoading } = useQuery({
    queryKey: ["review-groups"],
    queryFn: getReviewGroups,
    onSuccess: (data) => setGroups(data),
  } as any)

  const handleApplied = useCallback((key: string, count: number) => {
    setGroups(prev => prev ? prev.filter(g => g.canonical_key !== key) : prev)
    setAppliedCount(c => c + count)
  }, [])

  const handleSkipped = useCallback((key: string) => {
    setGroups(prev => prev ? prev.filter(g => g.canonical_key !== key) : prev)
  }, [])

  const pending = groups ?? []
  const totalOriginal = (groups?.length ?? 0) + appliedCount

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Entrenamiento</Text>
        <Text style={styles.subtitle}>
          {isLoading
            ? "Cargando…"
            : `${pending.length} grupos pendientes`}
        </Text>
      </View>

      {/* Barra de progreso */}
      {appliedCount > 0 && totalOriginal > 0 && (
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: `${Math.round((appliedCount / totalOriginal) * 100)}%` as `${number}%` },
          ]} />
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color="#e05c19" style={{ marginTop: 60 }} size="large" />
      ) : pending.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          <Text style={styles.emptyTitle}>
            {appliedCount > 0
              ? `¡Listo! ${appliedCount} txs entrenadas`
              : "Sin grupos pendientes"}
          </Text>
          <Text style={styles.emptyText}>
            {appliedCount > 0
              ? "El KB fue actualizado. Los siguientes estados de cuenta se clasificarán mejor."
              : "Todas tus transacciones tienen alta confianza o ya fueron clasificadas."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <GroupCard
            key={pending[0].canonical_key}
            group={pending[0]}
            index={0}
            total={pending.length}
            onApplied={handleApplied}
            onSkipped={handleSkipped}
          />
          {/* Vista previa de los siguientes */}
          {pending.length > 1 && (
            <View style={styles.queuePreview}>
              <Ionicons name="layers-outline" size={14} color="#9ca3af" />
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

// ── Estilos ───────────────────────────────────────────────────────────────────

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
  progressBar: {
    height: 4,
    backgroundColor: "#e5e7eb",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
  },
  scroll: { padding: 16 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardCounter: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  merchantName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1c2b4b",
    marginBottom: 4,
  },
  merchantDetail: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 14,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  statChip: {
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  selectorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  selector: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectorFull: {
    minWidth: "100%",
  },
  selectorLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "600",
    marginRight: 4,
    letterSpacing: 0.3,
  },
  selectorValue: {
    fontSize: 13,
    color: "#1c2b4b",
    fontWeight: "600",
    flex: 1,
    textTransform: "capitalize",
  },
  selectorPlaceholder: {
    color: "#9ca3af",
    fontWeight: "400",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  skipBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  skipBtnText: {
    color: "#6b7280",
    fontWeight: "600",
    fontSize: 14,
  },
  applyBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#e05c19",
  },
  applyBtnDisabled: {
    backgroundColor: "#d1d5db",
  },
  applyBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  queuePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    justifyContent: "center",
  },
  queueText: {
    color: "#9ca3af",
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c2b4b",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 14,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c2b4b",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalItemSelected: {
    backgroundColor: "#fef3ec",
  },
  modalItemText: {
    fontSize: 15,
    color: "#374151",
    textTransform: "capitalize",
  },
  modalItemTextSelected: {
    color: "#e05c19",
    fontWeight: "700",
  },
})
