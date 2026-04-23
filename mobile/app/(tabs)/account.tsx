/**
 * AccountScreen — perfil del usuario, perfil financiero y gestión
 * v2: edición inline de nombre, 5 campos extendidos (housing, deps, debt, pets, employment)
 * Tema: dark navy — idéntico al web
 */
import { useState, useEffect } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  Modal, FlatList, ActivityIndicator, TextInput, Switch,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { Ionicons } from "@expo/vector-icons"
import { getMe, deleteAccount, deleteAllAnalysis } from "@safpro/api/users"
import { changePassword } from "@safpro/api/auth"
import { deleteUploads } from "@safpro/api/files"
import { getApiClient } from "@safpro/api"
import { getAuthStore } from "@safpro/stores"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"

const TOKEN_KEY = "safpro_access_token"

// ── Opciones de perfil ────────────────────────────────────────────────────────
const INDUSTRIES = [
  { value: "tecnologia",      label: "Tecnología",                 emoji: "💻" },
  { value: "salud",           label: "Salud",                      emoji: "🏥" },
  { value: "educacion",       label: "Educación",                  emoji: "📚" },
  { value: "finanzas",        label: "Finanzas / Banca",           emoji: "🏦" },
  { value: "comercio",        label: "Comercio / Retail",          emoji: "🛒" },
  { value: "construccion",    label: "Construcción",               emoji: "🏗️" },
  { value: "gobierno",        label: "Gobierno",                   emoji: "🏛️" },
  { value: "transporte",      label: "Transporte",                 emoji: "🚛" },
  { value: "servicios",       label: "Servicios profesionales",    emoji: "💼" },
  { value: "entretenimiento", label: "Entretenimiento / Creativo", emoji: "🎭" },
  { value: "otro",            label: "Otro",                       emoji: "⚡" },
]

const GOALS = [
  { value: "fondo_emergencia", label: "Fondo de emergencia", emoji: "🛡️" },
  { value: "ahorro_general",   label: "Ahorrar más",         emoji: "🐖" },
  { value: "eliminar_deuda",   label: "Eliminar deudas",     emoji: "✂️" },
  { value: "invertir",         label: "Empezar a invertir",  emoji: "📈" },
  { value: "meta_especifica",  label: "Meta específica",     emoji: "🎯" },
]

const EMPLOYMENT = [
  { value: "employed_fixed",    label: "Empleado fijo" },
  { value: "employed_variable", label: "Empleado variable" },
  { value: "self_employed",     label: "Independiente" },
  { value: "business_owner",    label: "Dueño de negocio" },
  { value: "unemployed",        label: "Desempleado" },
]

const HOUSING_TYPES = [
  { value: "rent",     label: "Alquiler" },
  { value: "mortgage", label: "Hipoteca" },
  { value: "own",      label: "Casa propia" },
  { value: "family",   label: "Con familia" },
  { value: "other",    label: "Otro" },
]

// ── API helpers ───────────────────────────────────────────────────────────────
async function getProfile() {
  const res = await getApiClient().get("/users/profile")
  return res.data
}
async function updateProfile(data: Record<string, any>) {
  const res = await getApiClient().put("/users/profile", data)
  return res.data
}
async function updateMyName(full_name: string) {
  const res = await getApiClient().patch("/users/me", { full_name })
  return res.data
}
// ── Picker modal genérico ─────────────────────────────────────────────────────
function PickerModal({ visible, title, options, selected, onSelect, onClose }: {
  visible: boolean; title: string
  options: { value: string; label: string; emoji?: string }[]
  selected: string; onSelect: (v: string) => void; onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[ms.item, selected === item.value && ms.itemSelected]}
                onPress={() => { onSelect(item.value); onClose() }}
              >
                {item.emoji && <Text style={{ fontSize: 18 }}>{item.emoji}</Text>}
                <Text style={[ms.itemText, selected === item.value && { color: "#a5b4fc", fontWeight: "700" }]}>
                  {item.label}
                </Text>
                {selected === item.value && <Ionicons name="checkmark" size={18} color={INDIGO} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  )
}
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:   { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 40, maxHeight: "70%", borderTopWidth: 1, borderColor: BORDER },
  handle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: "center", marginBottom: 16 },
  title:   { fontSize: 16, fontWeight: "700", color: TEXT, paddingHorizontal: 20, marginBottom: 8 },
  item:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  itemSelected: { backgroundColor: "rgba(99,102,241,0.08)" },
  itemText: { color: MUTED, fontSize: 15, flex: 1 },
})

// ── Componentes auxiliares ────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return <Text style={st.sectionTitle}>{label}</Text>
}
function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={[st.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  )
}
function ActionRow({ icon, iconColor, label, onPress, chevron = true }: {
  icon: string; iconColor: string; label: string; onPress: () => void; chevron?: boolean
}) {
  return (
    <TouchableOpacity style={st.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.actionIcon, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={st.actionText}>{label}</Text>
      {chevron && <Ionicons name="chevron-forward" size={16} color={DIM} />}
    </TouchableOpacity>
  )
}

// UpgradeModal eliminado — ahora se navega a /upgrade (pantalla completa)
// Ver: mobile/app/upgrade.tsx

// ── Modal cambiar contraseña ──────────────────────────────────────────────────
function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [currentPwd,    setCurrentPwd]    = useState("")
  const [newPwd,        setNewPwd]        = useState("")
  const [confirmPwd,    setConfirmPwd]    = useState("")
  const [showCurrent,   setShowCurrent]   = useState(false)
  const [showNew,       setShowNew]       = useState(false)
  const [showConfirm,   setShowConfirm]   = useState(false)
  const [loading,       setLoading]       = useState(false)

  function resetForm() {
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd("")
    setShowCurrent(false); setShowNew(false); setShowConfirm(false)
  }
  function handleClose() { resetForm(); onClose() }

  async function handleSave() {
    if (!currentPwd.trim()) {
      Alert.alert("Campo requerido", "Ingresa tu contraseña actual."); return
    }
    if (newPwd.length < 8) {
      Alert.alert("Contraseña muy corta", "La nueva contraseña debe tener al menos 8 caracteres."); return
    }
    if (newPwd !== confirmPwd) {
      Alert.alert("No coinciden", "La nueva contraseña y su confirmación no coinciden."); return
    }
    if (newPwd === currentPwd) {
      Alert.alert("Sin cambios", "La nueva contraseña debe ser diferente a la actual."); return
    }
    setLoading(true)
    try {
      await changePassword(currentPwd, newPwd)
      resetForm()
      onClose()
      Alert.alert("✅ Contraseña actualizada", "Tu contraseña fue cambiada correctamente.")
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Contraseña actual incorrecta o error de servidor."
      Alert.alert("Error", msg)
    } finally {
      setLoading(false)
    }
  }

  function PwdField({ label, value, onChangeText, show, onToggle }: {
    label: string; value: string; onChangeText: (v: string) => void
    show: boolean; onToggle: () => void
  }) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: MUTED, fontSize: 12, fontWeight: "600", marginBottom: 6 }}>{label}</Text>
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10,
          borderWidth: 1, borderColor: BORDER,
        }}>
          <TextInput
            style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, color: TEXT, fontSize: 15 }}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={onToggle} style={{ paddingHorizontal: 12 }}>
            <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={MUTED as string} />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[ms.sheet, { paddingHorizontal: 20, paddingBottom: 40 }]}>
            <View style={ms.handle} />
            <Text style={[ms.title, { marginBottom: 20 }]}>🔑 Cambiar contraseña</Text>

            <PwdField
              label="Contraseña actual"
              value={currentPwd} onChangeText={setCurrentPwd}
              show={showCurrent} onToggle={() => setShowCurrent(v => !v)}
            />
            <PwdField
              label="Nueva contraseña (mín. 8 caracteres)"
              value={newPwd} onChangeText={setNewPwd}
              show={showNew} onToggle={() => setShowNew(v => !v)}
            />
            <PwdField
              label="Confirmar nueva contraseña"
              value={confirmPwd} onChangeText={setConfirmPwd}
              show={showConfirm} onToggle={() => setShowConfirm(v => !v)}
            />

            <TouchableOpacity
              style={{
                backgroundColor: INDIGO, borderRadius: 10,
                paddingVertical: 14, alignItems: "center",
                opacity: loading ? 0.6 : 1, marginTop: 4,
              }}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Guardar contraseña</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 12, alignItems: "center", paddingVertical: 10 }}
              onPress={handleClose}
            >
              <Text style={{ color: MUTED, fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function AccountScreen() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const { data: user }    = useQuery({ queryKey: ["me"],      queryFn: getMe })
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile })

  // ── Danger Zone — estado ─────────────────────────────────────────────────
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [confirmDeleteText,      setConfirmDeleteText]      = useState("")

  // ── Pickers básicos ───────────────────────────────────────────────────────
  const [showIndustryPicker, setShowIndustryPicker] = useState(false)
  const [showGoalPicker,     setShowGoalPicker]     = useState(false)
  const [showEmployPicker,   setShowEmployPicker]   = useState(false)
  const [showHousingPicker,  setShowHousingPicker]  = useState(false)
  const [showChangePwdModal, setShowChangePwdModal] = useState(false)

  // ── Edición inline de nombre ──────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState("")

  // ── Perfil extendido — estado local ───────────────────────────────────────
  const [housingLocal, setHousingLocal] = useState("")
  const [deptsLocal,   setDeptsLocal]   = useState(0)
  const [debtLocal,    setDebtLocal]    = useState("")
  const [petsLocal,    setPetsLocal]    = useState(false)
  const [extDirty,     setExtDirty]     = useState(false)

  // Sincronizar cuando llega el profile
  useEffect(() => {
    if (!profile) return
    setHousingLocal(profile.housing_type ?? "")
    setDeptsLocal(profile.dependents_count ?? 0)
    setDebtLocal(profile.monthly_debt_payments != null ? String(profile.monthly_debt_payments) : "")
    setPetsLocal(profile.has_pets ?? false)
  }, [profile?.profile_id])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) => updateProfile(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })

  const nameMut = useMutation({
    mutationFn: (name: string) => updateMyName(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] })
      setEditingName(false)
    },
    onError: () => Alert.alert("Error", "No se pudo actualizar el nombre."),
  })

  const extMut = useMutation({
    mutationFn: (data: Record<string, any>) => updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      setExtDirty(false)
      Alert.alert("✅ Guardado", "Perfil de presupuesto actualizado.")
    },
    onError: () => Alert.alert("Error", "No se pudo guardar el perfil."),
  })

  // ── Danger Zone — mutations ───────────────────────────────────────────────
  const deleteUploadsMut = useMutation({
    mutationFn: deleteUploads,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["analysis"] })
      Alert.alert("✅ Listo", `${data.records_deleted} archivo(s) de Excel eliminados. Tus análisis se conservan.`)
    },
    onError: () => Alert.alert("Error", "No se pudieron eliminar los archivos. Intenta de nuevo."),
  })

  const deleteAnalysisMut = useMutation({
    mutationFn: deleteAllAnalysis,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["analysis"] })
      Alert.alert("✅ Listo", `${data.snapshots_deleted} análisis y ${data.transactions_deleted} transacciones eliminados.`)
    },
    onError: () => Alert.alert("Error", "No se pudieron eliminar los análisis. Intenta de nuevo."),
  })

  const deleteAccountMut = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await SecureStore.deleteItemAsync(TOKEN_KEY)
      getAuthStore().getState().logout()
      router.replace("/(auth)/login")
    },
    onError: () => Alert.alert("Error", "No se pudo eliminar la cuenta. Intenta de nuevo."),
  })

  function confirmDeleteUploads() {
    Alert.alert(
      "¿Borrar archivos Excel?",
      "Se eliminarán los archivos subidos. Tus análisis e historial se conservan.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, borrar", style: "destructive", onPress: () => deleteUploadsMut.mutate() },
      ]
    )
  }

  function confirmDeleteAnalysis() {
    Alert.alert(
      "¿Eliminar todos los análisis?",
      "Se eliminarán TODOS tus análisis, transacciones y el historial. Esta acción es irreversible.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, eliminar todo", style: "destructive", onPress: () => deleteAnalysisMut.mutate() },
      ]
    )
  }

  function saveExtendedProfile() {
    extMut.mutate({
      housing_type:           housingLocal || null,
      dependents_count:       deptsLocal,
      monthly_debt_payments:  debtLocal ? parseFloat(debtLocal) : null,
      has_pets:               petsLocal,
    })
  }

  function handleLogout() {
    Alert.alert("Cerrar sesión", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión", style: "destructive",
        onPress: async () => {
          await SecureStore.deleteItemAsync(TOKEN_KEY)
          getAuthStore().getState().logout()
          router.replace("/(auth)/login")
        },
      },
    ])
  }

  const plan        = user?.plan ?? "free"
  const isPro       = plan === "pro" || plan === "friends_and_family"
  const initials    = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?"

  const industryLabel = INDUSTRIES.find(i => i.value === profile?.industry)
  const goalLabel     = GOALS.find(g => g.value === profile?.primary_goal)
  const employLabel   = EMPLOYMENT.find(e => e.value === profile?.employment_type)
  const housingLabel  = HOUSING_TYPES.find(h => h.value === housingLocal)

  return (
    <SafeAreaView style={st.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Header / Avatar ── */}
        <View style={st.header}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials}</Text>
          </View>

          {/* Nombre — con edición inline */}
          {editingName ? (
            <View style={st.nameEditRow}>
              <TextInput
                style={st.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => nameInput.trim() && nameMut.mutate(nameInput.trim())}
              />
              <TouchableOpacity
                style={[st.nameBtn, { backgroundColor: "rgba(99,102,241,0.2)" }]}
                onPress={() => nameInput.trim() && nameMut.mutate(nameInput.trim())}
                disabled={nameMut.isPending}
              >
                {nameMut.isPending
                  ? <ActivityIndicator color={INDIGO} size="small" />
                  : <Ionicons name="checkmark" size={16} color={INDIGO} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.nameBtn, { backgroundColor: "rgba(239,68,68,0.12)" }]}
                onPress={() => setEditingName(false)}
              >
                <Ionicons name="close" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.nameRow}>
              <Text style={st.userName}>{user?.full_name ?? "Usuario"}</Text>
              <TouchableOpacity
                onPress={() => { setNameInput(user?.full_name ?? ""); setEditingName(true) }}
                style={st.editLink}
              >
                <Text style={st.editLinkText}>Editar</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={st.userEmail}>{user?.email}</Text>

          {/* Plan badge */}
          <TouchableOpacity
            style={[st.planBadge, isPro
              ? { backgroundColor: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.3)" }
              : { backgroundColor: "rgba(224,92,25,0.1)",   borderColor: "rgba(224,92,25,0.3)" }
            ]}
            onPress={() => router.push("/upgrade")}
            activeOpacity={0.8}
          >
            <Ionicons name={isPro ? "star" : "flash"} size={13} color={isPro ? "#fbbf24" : "#f97316"} />
            <Text style={[st.planText, { color: isPro ? "#a5b4fc" : "#fb923c" }]}>
              {plan === "pro" ? "✦ Pro"
                : plan === "friends_and_family" ? "★ Friends & Family"
                : "Actualizar a Pro →"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Información de cuenta ── */}
        <View style={st.section}>
          <SectionHeader label="Cuenta" />
          <InfoRow label="Email verificado" value={user?.is_verified ? "✅ Sí" : "❌ No"} />
          {user?.totp_enabled
            ? <InfoRow label="2FA activado" value="✅ Activado" valueColor="#10b981" />
            : <ActionRow
                icon="shield-checkmark-outline"
                iconColor="#f59e0b"
                label="Activar autenticación 2FA"
                onPress={() => router.push("/2fa-setup")}
              />
          }
          <InfoRow label="Plan actual"      value={plan === "pro" ? "✦ Pro" : plan === "friends_and_family" ? "Friends & Family" : "Gratuito"} valueColor={isPro ? "#a5b4fc" : undefined} />
          <InfoRow label="Miembro desde"    value={user?.created_at ? new Date(user.created_at).toLocaleDateString("es-PA", { month: "long", year: "numeric" }) : "—"} />
        </View>

        {/* ── Perfil financiero básico ── */}
        <View style={st.section}>
          <SectionHeader label="Perfil financiero" />
          <Text style={st.profileHint}>
            Personaliza tu presupuesto 50/30/20 y las recomendaciones del asistente.
          </Text>
          <ActionRow icon="briefcase-outline" iconColor="#8b5cf6"
            label={industryLabel ? `${industryLabel.emoji} ${industryLabel.label}` : "Industria / Sector"}
            onPress={() => setShowIndustryPicker(true)} />
          <ActionRow icon="flag-outline" iconColor="#22c55e"
            label={goalLabel ? `${goalLabel.emoji} ${goalLabel.label}` : "Meta principal"}
            onPress={() => setShowGoalPicker(true)} />
          <ActionRow icon="person-outline" iconColor="#3b82f6"
            label={employLabel ? employLabel.label : "Tipo de empleo"}
            onPress={() => setShowEmployPicker(true)} />
        </View>

        {/* ── Perfil de presupuesto extendido (5 variables) ── */}
        <View style={st.section}>
          <SectionHeader label="Presupuesto personalizado" />
          <Text style={st.profileHint}>
            Estos datos ajustan automáticamente tus metas 50/30/20.
          </Text>

          {/* Tipo de vivienda */}
          <ActionRow icon="home-outline" iconColor="#0ea5e9"
            label={housingLabel ? housingLabel.label : "Tipo de vivienda"}
            onPress={() => setShowHousingPicker(true)} />

          {/* Dependientes — stepper */}
          <View style={st.stepperRow}>
            <View style={[st.actionIcon, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
              <Ionicons name="people-outline" size={18} color="#f59e0b" />
            </View>
            <Text style={st.actionText}>Dependientes a cargo</Text>
            <TouchableOpacity
              style={st.stepBtn}
              onPress={() => { if (deptsLocal > 0) { setDeptsLocal(d => d - 1); setExtDirty(true) } }}
            >
              <Ionicons name="remove" size={18} color={deptsLocal > 0 ? TEXT : MUTED} />
            </TouchableOpacity>
            <Text style={st.stepValue}>{deptsLocal}</Text>
            <TouchableOpacity
              style={st.stepBtn}
              onPress={() => { if (deptsLocal < 10) { setDeptsLocal(d => d + 1); setExtDirty(true) } }}
            >
              <Ionicons name="add" size={18} color={deptsLocal < 10 ? TEXT : MUTED} />
            </TouchableOpacity>
          </View>

          {/* Deuda mensual */}
          <View style={st.inputRow}>
            <View style={[st.actionIcon, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
            </View>
            <Text style={st.inputLabel}>Deuda mensual ($)</Text>
            <TextInput
              style={st.debtInput}
              value={debtLocal}
              onChangeText={(v) => { setDebtLocal(v.replace(/[^0-9.]/g, "")); setExtDirty(true) }}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={DIM as string}
              returnKeyType="done"
            />
          </View>

          {/* Mascotas — switch */}
          <View style={st.switchRow}>
            <View style={[st.actionIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <Ionicons name="paw-outline" size={18} color="#10b981" />
            </View>
            <Text style={[st.actionText, { flex: 1 }]}>Tengo mascotas</Text>
            <Switch
              value={petsLocal}
              onValueChange={(v) => { setPetsLocal(v); setExtDirty(true) }}
              trackColor={{ false: "rgba(255,255,255,0.12)", true: "rgba(16,185,129,0.5)" }}
              thumbColor={petsLocal ? "#10b981" : "#94a3b8"}
            />
          </View>

          {/* Botón guardar extendido */}
          {extDirty && (
            <TouchableOpacity
              style={st.saveExtBtn}
              onPress={saveExtendedProfile}
              disabled={extMut.isPending}
              activeOpacity={0.8}
            >
              {extMut.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.saveExtBtnText}>Guardar cambios →</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Suscripción ── */}
        <View style={st.section}>
          <SectionHeader label="Suscripción" />
          <ActionRow icon="card-outline" iconColor={INDIGO}
            label={isPro ? "Gestionar suscripción Pro" : "Actualizar a Pro"}
            onPress={() => router.push("/upgrade")} />
          <ActionRow icon="key-outline" iconColor={MUTED as string}
            label="Cambiar contraseña"
            onPress={() => setShowChangePwdModal(true)} />
        </View>

        {/* ── Herramientas ── */}
        <View style={st.section}>
          <SectionHeader label="Herramientas" />
          <ActionRow icon="flask-outline"       iconColor="#8b5cf6" label="Simulaciones"  onPress={() => router.push("/(tabs)/simulaciones")} />
          <ActionRow icon="help-circle-outline" iconColor="#3b82f6" label="Ayuda y FAQ"   onPress={() => router.push("/(tabs)/ayuda")} />
        </View>

        {/* ── Zona peligrosa ── */}
        <View style={st.dangerSection}>
          <Text style={st.dangerSectionTitle}>⚠️ Zona peligrosa</Text>

          {/* Borrar archivos Excel */}
          <View style={st.dangerCard}>
            <Text style={st.dangerCardTitle}>Borrar archivos Excel</Text>
            <Text style={st.dangerCardDesc}>
              Elimina los archivos subidos. Tus análisis e historial se conservan.
            </Text>
            <TouchableOpacity
              style={st.dangerBtn}
              onPress={confirmDeleteUploads}
              disabled={deleteUploadsMut.isPending}
              activeOpacity={0.8}
            >
              {deleteUploadsMut.isPending
                ? <ActivityIndicator color="#ef4444" size="small" />
                : <Text style={st.dangerBtnText}>Borrar archivos</Text>}
            </TouchableOpacity>
          </View>

          {/* Eliminar análisis */}
          <View style={st.dangerCard}>
            <Text style={st.dangerCardTitle}>Eliminar todos los análisis</Text>
            <Text style={st.dangerCardDesc}>
              Borra todos tus snapshots, transacciones e historial. Los archivos Excel originales no se tocan.
            </Text>
            <TouchableOpacity
              style={st.dangerBtn}
              onPress={confirmDeleteAnalysis}
              disabled={deleteAnalysisMut.isPending}
              activeOpacity={0.8}
            >
              {deleteAnalysisMut.isPending
                ? <ActivityIndicator color="#ef4444" size="small" />
                : <Text style={st.dangerBtnText}>Eliminar análisis</Text>}
            </TouchableOpacity>
          </View>

          {/* Eliminar cuenta */}
          <View style={[st.dangerCard, { borderColor: "rgba(239,68,68,0.4)", marginBottom: 0 }]}>
            <Text style={st.dangerCardTitle}>Eliminar mi cuenta</Text>
            <Text style={st.dangerCardDesc}>
              Elimina permanentemente tu cuenta y <Text style={{ fontWeight: "700" }}>todo lo asociado</Text> — análisis, transacciones, KB y archivos. Acción irreversible.
            </Text>
            <TouchableOpacity
              style={[st.dangerBtn, { backgroundColor: "rgba(239,68,68,0.18)" }]}
              onPress={() => { setConfirmDeleteText(""); setShowDeleteAccountModal(true) }}
              activeOpacity={0.8}
            >
              <Text style={[st.dangerBtnText, { fontWeight: "700" }]}>Eliminar cuenta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity style={st.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={st.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={st.footer}>SAFPRO · safpro.us</Text>
      </ScrollView>

      {/* Modals */}
      <ChangePasswordModal visible={showChangePwdModal} onClose={() => setShowChangePwdModal(false)} />

      {/* ── Modal eliminar cuenta ── */}
      <Modal visible={showDeleteAccountModal} transparent animationType="slide" onRequestClose={() => setShowDeleteAccountModal(false)}>
        <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={() => setShowDeleteAccountModal(false)}>
          <View style={[ms.sheet, { paddingHorizontal: 20, paddingBottom: 40 }]}>
            <View style={ms.handle} />
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#ef4444", marginBottom: 8 }}>
              Eliminar cuenta permanentemente
            </Text>
            <Text style={{ color: MUTED, fontSize: 13, lineHeight: 19, marginBottom: 20 }}>
              Se eliminarán tu cuenta, análisis, transacciones, archivos y Knowledge Base. Esta acción{" "}
              <Text style={{ fontWeight: "700", color: TEXT }}>no se puede deshacer</Text>.{"\n\n"}
              Escribe <Text style={{ color: "#ef4444", fontWeight: "700" }}>ELIMINAR</Text> para confirmar:
            </Text>
            <TextInput
              style={{
                backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 12, color: TEXT, fontSize: 16,
                borderWidth: 1.5, borderColor: confirmDeleteText === "ELIMINAR" ? "#ef4444" : BORDER,
                marginBottom: 16, letterSpacing: 2,
              }}
              value={confirmDeleteText}
              onChangeText={setConfirmDeleteText}
              placeholder="ELIMINAR"
              placeholderTextColor={DIM as string}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={{
                backgroundColor: confirmDeleteText === "ELIMINAR" ? "#ef4444" : "rgba(239,68,68,0.15)",
                borderRadius: 10, paddingVertical: 14, alignItems: "center",
                opacity: deleteAccountMut.isPending ? 0.6 : 1,
              }}
              onPress={() => {
                if (confirmDeleteText === "ELIMINAR") deleteAccountMut.mutate()
              }}
              disabled={confirmDeleteText !== "ELIMINAR" || deleteAccountMut.isPending}
              activeOpacity={0.8}
            >
              {deleteAccountMut.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: confirmDeleteText === "ELIMINAR" ? "#fff" : "#ef4444", fontWeight: "700", fontSize: 15 }}>
                    Eliminar mi cuenta
                  </Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 12, alignItems: "center", paddingVertical: 10 }}
              onPress={() => setShowDeleteAccountModal(false)}
            >
              <Text style={{ color: MUTED, fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <PickerModal visible={showIndustryPicker} title="Industria / Sector" options={INDUSTRIES}
        selected={profile?.industry ?? ""} onSelect={(v) => updateMut.mutate({ industry: v })}
        onClose={() => setShowIndustryPicker(false)} />
      <PickerModal visible={showGoalPicker} title="Meta principal" options={GOALS}
        selected={profile?.primary_goal ?? ""} onSelect={(v) => updateMut.mutate({ primary_goal: v })}
        onClose={() => setShowGoalPicker(false)} />
      <PickerModal visible={showEmployPicker} title="Tipo de empleo" options={EMPLOYMENT}
        selected={profile?.employment_type ?? ""} onSelect={(v) => { updateMut.mutate({ employment_type: v }); setExtDirty(true) }}
        onClose={() => setShowEmployPicker(false)} />
      <PickerModal visible={showHousingPicker} title="Tipo de vivienda" options={HOUSING_TYPES}
        selected={housingLocal} onSelect={(v) => { setHousingLocal(v); setExtDirty(true) }}
        onClose={() => setShowHousingPicker(false)} />
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    alignItems: "center",
    paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  avatar:      { width: 72, height: 72, borderRadius: 36, backgroundColor: INDIGO, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText:  { color: "#fff", fontSize: 28, fontWeight: "800" },

  // Nombre + edición inline
  nameRow:      { flexDirection: "row", alignItems: "center", gap: 8 },
  userName:     { color: TEXT, fontSize: 20, fontWeight: "700" },
  editLink:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(99,102,241,0.12)" },
  editLinkText: { color: INDIGO, fontSize: 12, fontWeight: "600" },
  nameEditRow:  { flexDirection: "row", alignItems: "center", gap: 6, width: "100%" },
  nameInput:    {
    flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, color: TEXT, fontSize: 16,
    borderWidth: 1, borderColor: INDIGO,
  },
  nameBtn: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  userEmail:   { color: MUTED, fontSize: 13, marginTop: 3 },
  planBadge:   { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12, borderWidth: 1 },
  planText:    { fontWeight: "700", fontSize: 13 },

  section:      { backgroundColor: CARD, margin: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  profileHint:  { color: DIM as string, fontSize: 12, lineHeight: 17, marginBottom: 12 },

  infoRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel: { color: MUTED, fontSize: 14 },
  infoValue: { fontWeight: "600", color: TEXT, fontSize: 14 },

  actionRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  actionIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  actionText: { color: TEXT, fontSize: 14, flex: 1 },

  // Stepper (dependientes)
  stepperRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  stepBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  stepValue:  { color: TEXT, fontSize: 18, fontWeight: "700", minWidth: 24, textAlign: "center" },

  // Deuda mensual input
  inputRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  inputLabel: { color: TEXT, fontSize: 14, flex: 1 },
  debtInput:  {
    backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, color: TEXT, fontSize: 14,
    textAlign: "right", minWidth: 80, borderWidth: 1, borderColor: BORDER,
  },

  // Mascotas switch
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },

  // Botón guardar extendido
  saveExtBtn: {
    marginTop: 14, backgroundColor: INDIGO, borderRadius: 10,
    paddingVertical: 12, alignItems: "center",
  },
  saveExtBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  logoutBtn:  { margin: 12, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logoutText: { color: "#ef4444", fontWeight: "700", fontSize: 15 },
  footer:     { color: DIM as string, textAlign: "center", fontSize: 12, marginBottom: 32, marginTop: 4 },

  // Danger zone
  dangerSection:      { margin: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", overflow: "hidden" },
  dangerSectionTitle: { color: "#ef4444", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", padding: 14, paddingBottom: 10, backgroundColor: "rgba(239,68,68,0.06)" },
  dangerCard:         { padding: 14, borderTopWidth: 1, borderTopColor: "rgba(239,68,68,0.12)", gap: 4, marginBottom: 0 },
  dangerCardTitle:    { color: TEXT, fontSize: 13, fontWeight: "700" },
  dangerCardDesc:     { color: MUTED, fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 8 },
  dangerBtn:          { backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: "flex-start", minWidth: 130, alignItems: "center" },
  dangerBtnText:      { color: "#ef4444", fontSize: 13, fontWeight: "600" },
})
