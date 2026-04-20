/**
 * ManualScreen — Entrada Manual de gastos/ingresos
 * Replica el flujo del web: tipo → categoría → monto (numpad) → guardar
 * Tema: dark navy
 */
import { useState } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal, FlatList, Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getApiClient } from "@safpro/api"

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

// ── Categorías ────────────────────────────────────────────────────────────────
type Category = { label: string; icon: string; color: string; section: string }

const CATEGORIES: Record<string, Category> = {
  supermercado:    { label: "Supermercado",   icon: "cart-outline",        color: "#6366f1", section: "Necesidades" },
  alimentacion:    { label: "Alimentación",   icon: "bag-outline",         color: "#8b5cf6", section: "Necesidades" },
  alquiler:        { label: "Alquiler",       icon: "home-outline",        color: "#3b82f6", section: "Necesidades" },
  servicios:       { label: "Servicios",      icon: "flash-outline",       color: "#f59e0b", section: "Necesidades" },
  transporte:      { label: "Transporte",     icon: "bus-outline",         color: "#0d9488", section: "Necesidades" },
  gasolina:        { label: "Gasolina",       icon: "flame-outline",       color: "#f97316", section: "Necesidades" },
  salud:           { label: "Salud",          icon: "heart-outline",       color: "#10b981", section: "Necesidades" },
  educacion:       { label: "Educación",      icon: "book-outline",        color: "#6366f1", section: "Necesidades" },
  hogar:           { label: "Hogar",          icon: "construct-outline",   color: "#7c3aed", section: "Necesidades" },
  seguro:          { label: "Seguro",         icon: "shield-outline",      color: "#3b82f6", section: "Necesidades" },
  restaurantes:    { label: "Restaurantes",   icon: "restaurant-outline",  color: "#ec4899", section: "Deseos" },
  entretenimiento: { label: "Entretenim.",    icon: "film-outline",        color: "#1d4ed8", section: "Deseos" },
  compras:         { label: "Compras",        icon: "storefront-outline",  color: "#f97316", section: "Deseos" },
  suscripciones:   { label: "Suscripciones",  icon: "refresh-outline",     color: "#8b5cf6", section: "Deseos" },
  tecnologia:      { label: "Tecnología",     icon: "laptop-outline",      color: "#1d4ed8", section: "Deseos" },
  streaming:       { label: "Streaming",      icon: "play-outline",        color: "#dc2626", section: "Deseos" },
  cafe:            { label: "Café",           icon: "cafe-outline",        color: "#92400e", section: "Deseos" },
  ropa:            { label: "Ropa",           icon: "shirt-outline",       color: "#ca8a04", section: "Deseos" },
  mascotas:        { label: "Mascotas",       icon: "paw-outline",         color: "#065f46", section: "Deseos" },
  cargo_financiero:{ label: "Cargo banco",   icon: "card-outline",        color: "#6b7280", section: "Financiero" },
  deudas:          { label: "Deuda",          icon: "alert-circle-outline",color: "#dc2626", section: "Financiero" },
  ahorro:          { label: "Ahorro",         icon: "save-outline",        color: "#10b981", section: "Financiero" },
  inversion:       { label: "Inversión",      icon: "trending-up-outline", color: "#3b82f6", section: "Financiero" },
  transferencias:  { label: "Transferencias", icon: "swap-horizontal-outline", color: "#8b5cf6", section: "Financiero" },
  otros:           { label: "Otros",          icon: "ellipsis-horizontal-outline", color: "#6b7280", section: "Otros" },
}

const SECTIONS = ["Necesidades", "Deseos", "Financiero", "Otros"]

// ── API ───────────────────────────────────────────────────────────────────────
async function createManualTx(data: {
  date: string; detail: string; amount: number
  movement_type: "debito" | "credito"; budget_category: string
}) {
  const res = await getApiClient().post("/manual-transactions", data)
  return res.data
}

async function listManualTxs() {
  const res = await getApiClient().get("/manual-transactions")
  return res.data as any[]
}

// ── Numpad ────────────────────────────────────────────────────────────────────
function Numpad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function press(key: string) {
    if (key === "⌫") { onChange(value.length > 1 ? value.slice(0, -1) : "0"); return }
    if (key === ".") { if (value.includes(".")) return; onChange(value + "."); return }
    if (value === "0" && key !== ".") { onChange(key); return }
    const parts = value.split(".")
    if (parts[1] !== undefined && parts[1].length >= 2) return
    if (parts[0].length >= 8 && parts[1] === undefined) return
    onChange(value + key)
  }

  const rows = [["7","8","9"],["4","5","6"],["1","2","3"],[".","0","⌫"]]

  return (
    <View style={numStyles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={numStyles.row}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={[numStyles.key, key === "⌫" && numStyles.keyDelete]}
              onPress={() => press(key)}
              activeOpacity={0.6}
            >
              {key === "⌫"
                ? <Ionicons name="backspace-outline" size={22} color={MUTED} />
                : <Text style={numStyles.keyText}>{key}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  )
}

const numStyles = StyleSheet.create({
  grid: { gap: 8, marginTop: 4 },
  row:  { flexDirection: "row", gap: 8 },
  key: {
    flex: 1, height: 54, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  keyDelete: { backgroundColor: "rgba(239,68,68,0.1)" },
  keyText:   { color: TEXT, fontSize: 20, fontWeight: "600" },
})

// ── Category picker modal ─────────────────────────────────────────────────────
function CategoryModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (k: string) => void; onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={modalS.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalS.sheet}>
          <View style={modalS.handle} />
          <Text style={modalS.title}>Categoría</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {SECTIONS.map((section) => {
              const items = Object.entries(CATEGORIES).filter(([, c]) => c.section === section)
              return (
                <View key={section}>
                  <Text style={modalS.sectionLabel}>{section}</Text>
                  <View style={modalS.catGrid}>
                    {items.map(([key, cat]) => (
                      <TouchableOpacity
                        key={key}
                        style={[modalS.catItem, selected === key && { borderColor: cat.color, backgroundColor: `${cat.color}18` }]}
                        onPress={() => { onSelect(key); onClose() }}
                        activeOpacity={0.75}
                      >
                        <View style={[modalS.catIcon, { backgroundColor: `${cat.color}22` }]}>
                          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                        </View>
                        <Text style={modalS.catLabel} numberOfLines={1}>{cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const modalS = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: "85%", borderTopWidth: 1, borderColor: BORDER },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: "center", marginBottom: 16 },
  title:        { fontSize: 16, fontWeight: "700", color: TEXT, paddingHorizontal: 20, marginBottom: 8 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: DIM as string, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  catGrid:      { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  catItem:      { width: "30%", borderRadius: 12, padding: 10, alignItems: "center", gap: 6, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.03)" },
  catIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabel:     { color: MUTED, fontSize: 11, fontWeight: "600", textAlign: "center" },
})

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function ManualScreen() {
  const queryClient = useQueryClient()
  const [type, setType]           = useState<"debito" | "credito">("debito")
  const [amount, setAmount]       = useState("0")
  const [category, setCategory]   = useState("")
  const [showCatModal, setShowCatModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const { data: history } = useQuery({ queryKey: ["manual-txs"], queryFn: listManualTxs })

  const amountNum = parseFloat(amount) || 0
  const catConfig = category ? CATEGORIES[category] : null
  const today     = new Date().toISOString().split("T")[0]

  const isGasto   = type === "debito"
  const accentColor = isGasto ? RED : GREEN

  async function handleSave() {
    if (amountNum <= 0)  { Alert.alert("Monto inválido", "Ingresa un monto mayor a 0."); return }
    if (!category)        { Alert.alert("Categoría", "Selecciona una categoría."); return }
    setSaving(true)
    try {
      await createManualTx({
        date: today,
        detail: catConfig?.label ?? category,
        amount: amountNum,
        movement_type: type,
        budget_category: category,
      })
      queryClient.invalidateQueries({ queryKey: ["aggregated"] })
      queryClient.invalidateQueries({ queryKey: ["manual-txs"] })
      setAmount("0")
      setCategory("")
      Alert.alert("✅ Guardado", `${isGasto ? "Gasto" : "Ingreso"} de $${amountNum.toFixed(2)} registrado.`)
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo guardar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Entrada Manual</Text>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn}>
          <Text style={styles.historyBtnText}>Historial ({history?.length ?? 0})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Tipo: Gasto / Ingreso */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, isGasto && { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)" }]}
            onPress={() => setType("debito")}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-down-circle" size={18} color={isGasto ? RED : MUTED} />
            <Text style={[styles.typeBtnText, isGasto && { color: RED }]}>💸 Gasto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, !isGasto && { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)" }]}
            onPress={() => setType("credito")}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up-circle" size={18} color={!isGasto ? GREEN : MUTED} />
            <Text style={[styles.typeBtnText, !isGasto && { color: GREEN }]}>💰 Ingreso</Text>
          </TouchableOpacity>
        </View>

        {/* Categoría + Fecha */}
        <View style={styles.row2}>
          <TouchableOpacity style={[styles.selectorCard, { flex: 1 }]} onPress={() => setShowCatModal(true)} activeOpacity={0.8}>
            <Text style={styles.selectorHint}>Categoría</Text>
            <View style={styles.selectorContent}>
              {catConfig
                ? <>
                    <View style={[styles.catDot, { backgroundColor: `${catConfig.color}30` }]}>
                      <Ionicons name={catConfig.icon as any} size={14} color={catConfig.color} />
                    </View>
                    <Text style={[styles.selectorValue, { color: catConfig.color }]} numberOfLines={1}>
                      {catConfig.label}
                    </Text>
                  </>
                : <Text style={styles.selectorPlaceholder}>Seleccionar →</Text>}
            </View>
          </TouchableOpacity>
          <View style={[styles.selectorCard, { paddingVertical: 12, paddingHorizontal: 14 }]}>
            <Text style={styles.selectorHint}>Fecha</Text>
            <Text style={[styles.selectorValue, { color: TEXT }]}>{today}</Text>
          </View>
        </View>

        {/* Monto */}
        <View style={styles.amountCard}>
          <Text style={[styles.amountDisplay, { color: amountNum > 0 ? accentColor : MUTED }]}>
            B/. {amountNum === 0 ? "0" : amount}
          </Text>
          {category && (
            <Text style={styles.amountSub} numberOfLines={1}>
              {catConfig?.label} · {isGasto ? "Gasto" : "Ingreso"}
            </Text>
          )}
        </View>

        {/* Numpad */}
        <Numpad value={amount} onChange={setAmount} />

        {/* Botón guardar */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: amountNum > 0 && category ? accentColor : "rgba(255,255,255,0.08)" }]}
          onPress={handleSave}
          disabled={saving || amountNum <= 0 || !category}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.saveBtnText, { color: amountNum > 0 && category ? "#fff" : MUTED }]}>
                Registrar {isGasto ? "gasto" : "ingreso"}
              </Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Category modal */}
      <CategoryModal
        visible={showCatModal}
        selected={category}
        onSelect={setCategory}
        onClose={() => setShowCatModal(false)}
      />

      {/* History modal */}
      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <TouchableOpacity style={histS.overlay} activeOpacity={1} onPress={() => setShowHistory(false)}>
          <View style={histS.sheet}>
            <View style={histS.handle} />
            <Text style={histS.title}>Historial manual</Text>
            {(!history || history.length === 0) ? (
              <Text style={histS.empty}>Aún no hay entradas manuales.</Text>
            ) : (
              <FlatList
                data={history.slice().reverse()}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => (
                  <View style={histS.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={histS.itemDetail} numberOfLines={1}>{item.detail}</Text>
                      <Text style={histS.itemDate}>{item.date} · {item.budget_category}</Text>
                    </View>
                    <Text style={[histS.itemAmount, { color: item.movement_type === "debito" ? RED : GREEN }]}>
                      {item.movement_type === "debito" ? "-" : "+"}${Math.abs(item.amount).toFixed(2)}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const histS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:   { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: "70%", borderTopWidth: 1, borderColor: BORDER },
  handle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: "center", marginBottom: 16 },
  title:   { fontSize: 16, fontWeight: "700", color: TEXT, paddingHorizontal: 20, marginBottom: 12 },
  empty:   { color: MUTED, textAlign: "center", padding: 32 },
  item:    { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  itemDetail: { color: TEXT,  fontSize: 14, fontWeight: "600" },
  itemDate:   { color: MUTED, fontSize: 12, marginTop: 2 },
  itemAmount: { fontSize: 15, fontWeight: "700" },
})

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title:          { color: TEXT, fontSize: 22, fontWeight: "700" },
  historyBtn:     { padding: 6 },
  historyBtnText: { color: INDIGO, fontSize: 13, fontWeight: "600" },

  body: { padding: 16, gap: 12 },

  typeToggle: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  typeBtnText: { color: MUTED, fontSize: 15, fontWeight: "700" },

  row2:         { flexDirection: "row", gap: 10 },
  selectorCard: {
    backgroundColor: CARD,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
    justifyContent: "center",
  },
  selectorHint:        { color: DIM as string, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, marginBottom: 6 },
  selectorContent:     { flexDirection: "row", alignItems: "center", gap: 6 },
  catDot:              { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  selectorValue:       { fontSize: 13, fontWeight: "700", flex: 1 },
  selectorPlaceholder: { color: INDIGO, fontSize: 13, fontWeight: "600" },

  amountCard:    { backgroundColor: CARD, borderRadius: 12, padding: 20, alignItems: "center", borderWidth: 1, borderColor: BORDER },
  amountDisplay: { fontSize: 48, fontWeight: "800" },
  amountSub:     { color: MUTED, fontSize: 13, marginTop: 6 },

  saveBtn: {
    borderRadius: 14, padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { fontSize: 16, fontWeight: "700" },
})
