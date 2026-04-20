/**
 * AccountScreen — perfil del usuario, herramientas y cerrar sesión
 * Tema: dark navy — idéntico al web
 */
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { Ionicons } from "@expo/vector-icons"
import { getMe } from "@safpro/api/users"
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

function PlanBadge({ plan }: { plan: string }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    pro:              { label: "✦ Pro",               color: "#a5b4fc", bg: "rgba(99,102,241,0.18)" },
    friends_and_family: { label: "★ Friends & Family", color: "#93c5fd", bg: "rgba(59,130,246,0.18)" },
    free:             { label: "Gratuito",             color: MUTED,     bg: "rgba(255,255,255,0.07)" },
  }
  const c = configs[plan] ?? configs.free
  return (
    <View style={[styles.planBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.planText, { color: c.color }]}>{c.label}</Text>
    </View>
  )
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  )
}

function ActionRow({ icon, color, label, onPress }: {
  icon: string; color: string; label: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={DIM} />
    </TouchableOpacity>
  )
}

export default function AccountScreen() {
  const router = useRouter()
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })
  const plan = user?.plan ?? "free"

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?"

  function handleLogout() {
    Alert.alert(
      "Cerrar sesión",
      "¿Estás seguro que quieres cerrar sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: async () => {
            await SecureStore.deleteItemAsync(TOKEN_KEY)
            getAuthStore().getState().logout()
            router.replace("/(auth)/login")
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header / Avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.full_name ?? "Usuario"}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <PlanBadge plan={plan} />
        </View>

        {/* Cuenta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <InfoRow label="Email verificado" value={user?.is_verified ? "✅ Sí" : "❌ No"} />
          <InfoRow label="2FA activado"     value={user?.totp_enabled ? "✅ Sí" : "❌ No"} />
          <InfoRow
            label="Plan actual"
            value={plan === "pro" ? "✦ Pro" : plan === "friends_and_family" ? "Friends & Family" : "Gratuito"}
            valueColor={plan !== "free" ? INDIGO : undefined}
          />
        </View>

        {/* Herramientas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Herramientas</Text>
          <ActionRow icon="flask-outline"       color="#8b5cf6" label="Simulaciones"      onPress={() => router.push("/(tabs)/simulaciones")} />
          <ActionRow icon="help-circle-outline" color="#3b82f6" label="Ayuda y FAQ"       onPress={() => router.push("/(tabs)/ayuda")} />
        </View>

        {/* Gestión */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gestión</Text>
          <ActionRow icon="arrow-up-circle-outline" color={INDIGO}    label="Actualizar plan"     onPress={() => Alert.alert("Próximamente", "Gestión de plan disponible pronto.")} />
          <ActionRow icon="key-outline"             color={MUTED as string}    label="Cambiar contraseña" onPress={() => Alert.alert("Próximamente", "Disponible pronto.")} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>SAFPRO · safpro.us</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: CARD,
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    background: undefined,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  avatarText:  { color: "#fff", fontSize: 28, fontWeight: "800" },
  userName:    { color: TEXT,  fontSize: 20, fontWeight: "700" },
  userEmail:   { color: MUTED, fontSize: 13, marginTop: 3 },
  planBadge:   { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 10 },
  planText:    { fontWeight: "700", fontSize: 13 },

  section: {
    backgroundColor: CARD,
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { fontWeight: "700", color: MUTED as string, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  infoLabel: { color: MUTED as string, fontSize: 14 },
  infoValue: { fontWeight: "600", color: TEXT, fontSize: 14 },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  actionIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  actionText: { color: TEXT, fontSize: 14, flex: 1 },

  logoutBtn: {
    margin: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { color: "#ef4444", fontWeight: "700", fontSize: 15 },

  footer: { color: DIM as string, textAlign: "center", fontSize: 12, marginBottom: 32, marginTop: 4 },
})
