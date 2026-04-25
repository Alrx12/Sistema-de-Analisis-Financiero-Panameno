/**
 * TransactionsScreen — lista completa de transacciones de un snapshot
 * Ruta: /(tabs)/transactions/[id]
 * Incluye: búsqueda, filtros, reclasificación inline con "también aprender"
 */
import { useState } from "react"
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, ScrollView, Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getTransactions, reclassifyTransaction } from "@safpro/api/analysis"
import type { Transaction, ReclassifyRequest } from "@safpro/types"

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
const AMBER  = "#f59e0b"

// ── Categorías ────────────────────────────────────────────────────────────────
const CATS_GASTO = [
  "alimentacion","supermercado","alquiler","hipoteca","servicios",
  "agua","luz","internet","telefono","transporte","gasolina",
  "salud","educacion","hogar","seguro",
  "restaurantes","entretenimiento","compras","suscripciones","ocio",
  "ropa","tecnologia","deporte","streaming","cafe","bares","mascotas",
  "cargo_financiero","deuda","ahorro","inversion","transferencias","otros",
]
const CATS_INGRESO = [
  "salario","honorarios","comision","bono","negocio","venta",
  "alquiler_cobrado","dividendos","rendimiento",
  "reembolso","regalo","pension","ahorro","inversion","transferencias","otros_ingresos",
]
const ETYPES = ["ingreso","gasto","cargo_financiero","transferencia_propia","transferencia_tercero","reembolso"]
const EDETAILS = ["gasto_variable","gasto_recurrente","salario","otros_ingresos","comision","impuesto","cargo_bancario","transferencia_propia","transferencia_tercero","reembolso"]
const SUBTYPES = ["recurrente","extraordinario","variable","financiero","desconocido"]
const BROLES   = ["presupuestable","no_presupuestable","gasto_operativo","gasto_financiero","ahorro_inversion","solo_balance"]

function cap(s: string) { return s.replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase()) }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("es-PA", { day: "numeric", month: "short" })
}
function fmtCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function needsReview(t: Transaction) {
  // Transactions already corrected by the user don't need review
  // (matches the same exclusion logic used by the training endpoint)
  if (t.method === "user_reclassified") return false
  // Credits (ingresos) are excluded: /review-groups only handles debits (amount < 0).
  // Income transactions needing review can be fixed individually from the list.
  if ((t.amount ?? 0) > 0) return false
  return t.requires_review || t.budget_role === "revisar" || (t.budget_category ?? "").includes("desconocido")
}
function confColor(c: number) {
  if (c >= 0.8) return GREEN
  if (c >= 0.5) return AMBER
  return RED
}

// ── Reclassify Modal ──────────────────────────────────────────────────────────
function ReclassifyModal({
  tx, visible, onClose, onSave, saving,
}: {
  tx: Transaction; visible: boolean; onClose: () => void
  onSave: (d: ReclassifyRequest) => void; saving: boolean
}) {
  const [form, setForm] = useState<ReclassifyRequest>({
    economic_type:        tx.economic_type ?? "gasto",
    economic_type_detail: tx.economic_type_detail ?? "gasto_variable",
    subtype_economic:     tx.subtype_economic ?? "desconocido",
    budget_category:      tx.budget_category ?? "",
    budget_role:          tx.budget_role ?? "revisar",
    also_learn:           true,
  })

  const cats = form.economic_type === "ingreso" ? CATS_INGRESO : CATS_GASTO

  function Picker({ label, value, options, onChange }: {
    label: string; value: string; options: string[]; onChange: (v: string) => void
  }) {
    return (
      <View style={ms.field}>
        <Text style={ms.fieldLabel}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ms.pillRow}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[ms.pill, value === opt && ms.pillActive]}
              onPress={() => onChange(opt)}
            >
              <Text style={[ms.pillText, value === opt && ms.pillTextActive]} numberOfLines={1}>
                {cap(opt)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Corregir clasificación</Text>
          <Text style={ms.subtitle} numberOfLines={2}>{tx.detail}</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Picker label="Tipo económico" value={form.economic_type} options={ETYPES}
              onChange={v => setForm({ ...form, economic_type: v, budget_category: "" })} />
            <Picker label="Detalle" value={form.economic_type_detail} options={EDETAILS}
              onChange={v => setForm({ ...form, economic_type_detail: v })} />
            <Picker label="Categoría" value={form.budget_category} options={cats}
              onChange={v => setForm({ ...form, budget_category: v })} />
            <Picker label="Subtipo" value={form.subtype_economic} options={SUBTYPES}
              onChange={v => setForm({ ...form, subtype_economic: v })} />
            <Picker label="Rol presupuesto" value={form.budget_role} options={BROLES}
              onChange={v => setForm({ ...form, budget_role: v })} />

            {/* Aprender */}
            <TouchableOpacity
              style={ms.learnRow}
              onPress={() => setForm(f => ({ ...f, also_learn: !f.also_learn }))}
            >
              <View style={[ms.checkbox, form.also_learn && ms.checkboxActive]}>
                {form.also_learn && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={ms.learnText}>Aprender esta corrección para el futuro</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ms.saveBtn, saving && { opacity: 0.6 }]}
              onPress={() => onSave(form)}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={ms.saveBtnText}>Guardar corrección</Text>
                  </>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const ms = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet:         { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: "90%", borderTopWidth: 1, borderColor: BORDER },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: "center", marginBottom: 16 },
  title:         { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 4 },
  subtitle:      { fontSize: 12, color: MUTED, marginBottom: 16 },
  field:         { marginBottom: 16 },
  fieldLabel:    { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: DIM as string, textTransform: "uppercase", marginBottom: 8 },
  pillRow:       { flexDirection: "row" },
  pill:          { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.04)", marginRight: 6 },
  pillActive:    { backgroundColor: "rgba(99,102,241,0.2)", borderColor: INDIGO },
  pillText:      { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },
  pillTextActive:{ color: "#a5b4fc", fontWeight: "700" },
  learnRow:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, marginBottom: 8 },
  checkbox:      { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  checkboxActive:{ backgroundColor: INDIGO, borderColor: INDIGO },
  learnText:     { color: MUTED, fontSize: 14 },
  saveBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: INDIGO, borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  saveBtnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
})

// ── Transaction row ───────────────────────────────────────────────────────────
function TxRow({ tx, onEdit }: { tx: Transaction; onEdit: () => void }) {
  const isIncome = tx.economic_type === "ingreso" || tx.movement_type === "credito" || tx.amount > 0
  const review   = needsReview(tx)

  return (
    <TouchableOpacity style={[styles.txRow, review && styles.txRowReview]} onPress={onEdit} activeOpacity={0.75}>
      <View style={styles.txLeft}>
        <View style={styles.txDateWrap}>
          <Text style={styles.txDate}>{fmtDate(tx.date)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.txDetail} numberOfLines={1}>{tx.detail}</Text>
            {review && <Ionicons name="warning-outline" size={12} color={AMBER} />}
          </View>
          <View style={styles.txMeta}>
            <View style={[styles.txBadge, { backgroundColor: isIncome ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }]}>
              <Text style={[styles.txBadgeText, { color: isIncome ? GREEN : RED }]}>
                {cap(tx.economic_type ?? tx.movement_type)}
              </Text>
            </View>
            <Text style={styles.txCat} numberOfLines={1}>{cap(tx.budget_category ?? "sin categoría")}</Text>
            <Text style={[styles.txConf, { color: confColor(tx.confidence) }]}>
              {(tx.confidence * 100).toFixed(0)}%
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: isIncome ? GREEN : RED }]}>
          {isIncome ? "+" : "−"}{fmtCurrency(Math.abs(tx.amount))}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={DIM as string} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function TransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const qc      = useQueryClient()

  const [search,        setSearch]        = useState("")
  const [filterMove,    setFilterMove]    = useState<"all"|"credit"|"debit">("all")
  const [filterEtype,   setFilterEtype]   = useState("all")
  const [filterReview,  setFilterReview]  = useState(false)
  const [editingTx,     setEditingTx]     = useState<Transaction | null>(null)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", id],
    queryFn:  () => getTransactions(id!),
    enabled:  !!id,
  })

  const reclassify = useMutation({
    mutationFn: ({ txId, data }: { txId: string; data: ReclassifyRequest }) =>
      reclassifyTransaction(txId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", id] })
      setEditingTx(null)
      Alert.alert("✅ Guardado", "Clasificación actualizada correctamente.")
    },
    onError: () => Alert.alert("Error", "No se pudo guardar la corrección."),
  })

  const reviewCount = transactions.filter(needsReview).length

  const filtered = transactions.filter(t => {
    if (filterReview && !needsReview(t)) return false
    if (search && !t.detail.toLowerCase().includes(search.toLowerCase()) &&
        !(t.budget_category ?? "").toLowerCase().includes(search.toLowerCase())) return false
    if (filterMove !== "all" && t.movement_type !== filterMove) return false
    if (filterEtype !== "all" && t.economic_type !== filterEtype) return false
    return true
  })

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transacciones</Text>
          <Text style={styles.subtitle}>
            {filtered.length !== transactions.length
              ? `${filtered.length} de ${transactions.length}`
              : `${transactions.length} en total`}
            {reviewCount > 0 && (
              <Text style={{ color: RED }}> · {reviewCount} a revisar</Text>
            )}
          </Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={MUTED} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar descripción o categoría…"
          placeholderTextColor={MUTED}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search !== "" && (
          <TouchableOpacity onPress={() => setSearch("")} style={{ paddingRight: 12 }}>
            <Ionicons name="close-circle" size={16} color={MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.filterWrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {[["all","Todas"],["credit","Créditos"],["debit","Débitos"]].map(([val, lbl]) => (
          <TouchableOpacity
            key={val}
            style={[styles.pill, filterMove === val && styles.pillActive]}
            onPress={() => setFilterMove(val as any)}
          >
            <Text style={[styles.pillText, filterMove === val && styles.pillTextActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        {[["all","Tipo"],["ingreso","Ingreso"],["gasto","Gasto"],["cargo_financiero","Financiero"],["transferencia_propia","Trans. propia"]].map(([val, lbl]) => (
          <TouchableOpacity
            key={val}
            style={[styles.pill, filterEtype === val && styles.pillActive]}
            onPress={() => setFilterEtype(val)}
          >
            <Text style={[styles.pillText, filterEtype === val && styles.pillTextActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.pill, filterReview && { borderColor: AMBER, backgroundColor: "rgba(245,158,11,0.1)" }]}
          onPress={() => setFilterReview(v => !v)}
        >
          <Ionicons name="warning-outline" size={12} color={filterReview ? AMBER : MUTED} />
          <Text style={[styles.pillText, filterReview && { color: AMBER }]}>
            {filterReview ? "Mostrar todas" : `Revisar (${reviewCount})`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </View>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color={INDIGO} style={{ marginTop: 60 }} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.transaction_id}
          renderItem={({ item }) => <TxRow tx={item} onEdit={() => setEditingTx(item)} />}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {filterReview ? "¡Sin transacciones pendientes! 🎉" : "Sin resultados"}
              </Text>
            </View>
          }
        />
      )}

      {/* Reclassify modal */}
      {editingTx && (
        <ReclassifyModal
          tx={editingTx}
          visible={!!editingTx}
          onClose={() => setEditingTx(null)}
          onSave={(data) => reclassify.mutate({ txId: editingTx.transaction_id, data })}
          saving={reclassify.isPending}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: CARD, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:  { padding: 4 },
  title:    { color: TEXT,  fontSize: 18, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 12, marginTop: 2 },

  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD, margin: 12, marginBottom: 0,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 14, paddingVertical: 10, paddingHorizontal: 8 },

  // Wrapper View forces BG on Android (ScrollView doesn't inherit parent bg)
  filterWrapper: { backgroundColor: BG },
  filterScroll:  { flexGrow: 0, backgroundColor: BG },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: "row" },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillActive:    { backgroundColor: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.4)" },
  pillText:      { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },
  pillTextActive:{ color: "#a5b4fc", fontWeight: "600" },

  txRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD, borderRadius: 12, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: BORDER,
  },
  txRowReview: { borderLeftWidth: 3, borderLeftColor: AMBER },
  txLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  txDateWrap: { width: 34, alignItems: "center" },
  txDate:  { color: MUTED, fontSize: 11, fontWeight: "600", textAlign: "center" },
  txDetail:{ color: TEXT,  fontSize: 13, fontWeight: "600" },
  txMeta:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  txBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  txBadgeText: { fontSize: 10, fontWeight: "700" },
  txCat:   { color: MUTED, fontSize: 11 },
  txConf:  { fontSize: 10, fontWeight: "600" },
  txRight: { alignItems: "flex-end", gap: 4, marginLeft: 8 },
  txAmount:{ fontSize: 14, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { color: MUTED, fontSize: 15 },
})
