/**
 * AccountScreen — perfil del usuario, perfil financiero y gestión
 * Tema: dark navy — idéntico al web
 */
import { useState } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  Linking, Modal, FlatList,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { Ionicons } from "@expo/vector-icons"
import { getMe } from "@safpro/api/users"
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
const UPGRADE_URL = "https://safpro.us/upgrade"

// ── Opciones de perfil ────────────────────────────────────────────────────────
const INDUSTRIES = [
  { value: "tecnologia",   label: "Tecnología",           emoji: "💻" },
  { value: "salud",        label: "Salud",                emoji: "🏥" },
  { value: "educacion",    label: "Educación",            emoji: "📚" },
  { value: "finanzas",     label: "Finanzas / Banca",     emoji: "🏦" },
  { value: "comercio",     label: "Comercio / Retail",    emoji: "🛒" },
  { value: "construccion", label: "Construcción",         emoji: "🏗️" },
  { value: "gobierno",     label: "Gobierno",             emoji: "🏛️" },
  { value: "transporte",   label: "Transporte",           emoji: "🚛" },
  { value: "servicios",    label: "Servicios profesionales", emoji: "💼" },
  { value: "otro",         label: "Otro",                 emoji: "⚡" },
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

// ── API helpers ───────────────────────────────────────────────────────────────
async function getProfile() {
  const res = await getApiClient().get("/users/profile")
  return res.data
}
async function updateProfile(data: Record<string, any>) {
  const res = await getApiClient().put("/users/profile", data)
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

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function AccountScreen() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const { data: user }    = useQuery({ queryKey: ["me"],      queryFn: getMe })
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile })

  const [showIndustryPicker, setShowIndustryPicker] = useState(false)
  const [showGoalPicker,     setShowGoalPicker]     = useState(false)
  const [showEmployPicker,   setShowEmployPicker]   = useState(false)

  const updateMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })

  const plan     = user?.plan ?? "free"
  const isPro    = plan === "pro" || plan === "friends_and_family"
  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?"

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

  const industryLabel = INDUSTRIES.find(i => i.value === profile?.industry)
  const goalLabel     = GOALS.find(g => g.value === profile?.primary_goal)
  const employLabel   = EMPLOYMENT.find(e => e.value === profile?.employment_type)

  return (
    <SafeAreaView style={st.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header / Avatar */}
        <View style={st.header}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials}</Text>
          </View>
          <Text style={st.userName}>{user?.full_name ?? "Usuario"}</Text>
          <Text style={st.userEmail}>{user?.email}</Text>
          {/* Plan badge */}
          <TouchableOpacity
            style={[st.planBadge, isPro
              ? { backgroundColor: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.3)" }
              : { backgroundColor: "rgba(224,92,25,0.1)",   borderColor: "rgba(224,92,25,0.3)" }
            ]}
            onPress={() => Linking.openURL(UPGRADE_URL)}
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

        {/* Información de cuenta */}
        <View style={st.section}>
          <SectionHeader label="Cuenta" />
          <InfoRow label="Email verificado" value={user?.is_verified ? "✅ Sí" : "❌ No"} />
          <InfoRow label="2FA activado"     value={user?.totp_enabled ? "✅ Sí" : "❌ No"} />
          <InfoRow
            label="Plan actual"
            value={plan === "pro" ? "✦ Pro" : plan === "friends_and_family" ? "Friends & Family" : "Gratuito"}
            valueColor={isPro ? "#a5b4fc" : undefined}
          />
          <InfoRow label="Miembro desde"   value={user?.created_at ? new Date(user.created_at).toLocaleDateString("es-PA", { month: "long", year: "numeric" }) : "—"} />
        </View>

        {/* Perfil financiero */}
        <View style={st.section}>
          <SectionHeader label="Perfil financiero" />
          <Text style={st.profileHint}>
            Personaliza tu presupuesto 50/30/20 y las recomendaciones del asistente.
          </Text>

          <ActionRow
            icon="briefcase-outline"
            iconColor="#8b5cf6"
            label={industryLabel ? `${industryLabel.emoji} ${industryLabel.label}` : "Industria / Sector"}
            onPress={() => setShowIndustryPicker(true)}
          />
          <ActionRow
            icon="flag-outline"
            iconColor="#22c55e"
            label={goalLabel ? `${goalLabel.emoji} ${goalLabel.label}` : "Meta principal"}
            onPress={() => setShowGoalPicker(true)}
          />
          <ActionRow
            icon="person-outline"
            iconColor="#3b82f6"
            label={employLabel ? employLabel.label : "Tipo de empleo"}
            onPress={() => setShowEmployPicker(true)}
          />
        </View>

        {/* Suscripción */}
        <View style={st.section}>
          <SectionHeader label="Suscripción" />
          <ActionRow
            icon="card-outline"
            iconColor={INDIGO}
            label={isPro ? "Gestionar suscripción Pro" : "Actualizar a Pro"}
            onPress={() => Linking.openURL(UPGRADE_URL)}
          />
          <ActionRow
            icon="key-outline"
            iconColor={MUTED as string}
            label="Cambiar contraseña"
            onPress={() => Alert.alert("Próximamente", "Disponible en la versión web.")}
          />
        </View>

        {/* Herramientas */}
        <View style={st.section}>
          <SectionHeader label="Herramientas" />
          <ActionRow icon="flask-outline"       iconColor="#8b5cf6" label="Simulaciones"  onPress={() => router.push("/(tabs)/simulaciones")} />
          <ActionRow icon="help-circle-outline" iconColor="#3b82f6" label="Ayuda y FAQ"   onPress={() => router.push("/(tabs)/ayuda")} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={st.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={st.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={st.footer}>SAFPRO · safpro.us</Text>
      </ScrollView>

      {/* Pickers */}
      <PickerModal
        visible={showIndustryPicker}
        title="Industria / Sector"
        options={INDUSTRIES}
        selected={profile?.industry ?? ""}
        onSelect={(v) => updateMut.mutate({ industry: v })}
        onClose={() => setShowIndustryPicker(false)}
      />
      <PickerModal
        visible={showGoalPicker}
        title="Meta principal"
        options={GOALS}
        selected={profile?.primary_goal ?? ""}
        onSelect={(v) => updateMut.mutate({ primary_goal: v })}
        onClose={() => setShowGoalPicker(false)}
      />
      <PickerModal
        visible={showEmployPicker}
        title="Tipo de empleo"
        options={EMPLOYMENT}
        selected={profile?.employment_type ?? ""}
        onSelect={(v) => updateMut.mutate({ employment_type: v })}
        onClose={() => setShowEmployPicker(false)}
      />
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
  userName:    { color: TEXT,  fontSize: 20, fontWeight: "700" },
  userEmail:   { color: MUTED, fontSize: 13, marginTop: 3 },
  planBadge:   { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12, borderWidth: 1 },
  planText:    { fontWeight: "700", fontSize: 13 },

  section:     { backgroundColor: CARD, margin: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle:{ color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  profileHint: { color: DIM as string, fontSize: 12, lineHeight: 17, marginBottom: 12 },

  infoRow:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:  { color: MUTED, fontSize: 14 },
  infoValue:  { fontWeight: "600", color: TEXT, fontSize: 14 },

  actionRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  actionIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  actionText: { color: TEXT, fontSize: 14, flex: 1 },

  logoutBtn:  { margin: 12, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logoutText: { color: "#ef4444", fontWeight: "700", fontSize: 15 },
  footer:     { color: DIM as string, textAlign: "center", fontSize: 12, marginBottom: 32, marginTop: 4 },
})
