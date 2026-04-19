/**
 * AccountScreen — perfil del usuario y cerrar sesión
 */
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { Ionicons } from "@expo/vector-icons"
import { getMe } from "@safpro/api/users"
import { getAuthStore } from "@safpro/stores"

const TOKEN_KEY = "safpro_access_token"

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pro: { label: "✦ Pro", color: "#7c3aed", bg: "#f3e8ff" },
  friends_and_family: { label: "★ Friends & Family", color: "#0369a1", bg: "#e0f2fe" },
  free: { label: "Gratuito", color: "#6b7280", bg: "#f3f4f6" },
}

export default function AccountScreen() {
  const router = useRouter()
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })

  const plan = PLAN_LABELS[user?.plan ?? "free"] ?? PLAN_LABELS.free

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
    <SafeAreaView style={styles.safe}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.full_name ?? "Usuario"}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={[styles.planBadge, { backgroundColor: plan.bg }]}>
            <Text style={[styles.planText, { color: plan.color }]}>{plan.label}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email verificado</Text>
            <Text style={styles.infoValue}>{user?.is_verified ? "✅ Sí" : "❌ No"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>2FA activado</Text>
            <Text style={styles.infoValue}>{user?.totp_enabled ? "✅ Sí" : "❌ No"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Plan actual</Text>
            <Text style={[styles.infoValue, { color: plan.color }]}>{plan.label}</Text>
          </View>
        </View>

        {/* Herramientas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Herramientas</Text>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/(tabs)/simulaciones")}>
            <View style={styles.actionIcon}>
              <Ionicons name="flask-outline" size={18} color="#e05c19" />
            </View>
            <Text style={styles.actionText}>Simulaciones</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/(tabs)/ayuda")}>
            <View style={styles.actionIcon}>
              <Ionicons name="help-circle-outline" size={18} color="#3b82f6" />
            </View>
            <Text style={styles.actionText}>Ayuda y FAQ</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Acciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert("Próximamente", "Gestión de plan disponible pronto.")}>
            <View style={styles.actionIcon}>
              <Ionicons name="arrow-up-circle-outline" size={18} color="#7c3aed" />
            </View>
            <Text style={styles.actionText}>Actualizar plan</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert("Próximamente", "Cambio de contraseña disponible pronto.")}>
            <View style={styles.actionIcon}>
              <Ionicons name="key-outline" size={18} color="#6b7280" />
            </View>
            <Text style={styles.actionText}>Cambiar contraseña</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>SAFPRO v1.0.0 · safpro.us</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f5f7" },
  header: {
    backgroundColor: "#1c2b4b",
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e05c19",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#ffffff", fontSize: 32, fontWeight: "700" },
  userName: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  userEmail: { color: "#93afd4", fontSize: 13, marginTop: 4 },
  planBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 10 },
  planText: { fontWeight: "700", fontSize: 13 },
  section: {
    backgroundColor: "#ffffff",
    margin: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontWeight: "700", color: "#1c2b4b", marginBottom: 12, fontSize: 15 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoLabel: { color: "#6b7280" },
  infoValue: { fontWeight: "600", color: "#1c2b4b" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 10,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#374151", fontSize: 15, flex: 1 },
  logoutBtn: {
    margin: 12,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  logoutText: { color: "#dc2626", fontWeight: "700", fontSize: 15 },
  footer: { color: "#9ca3af", textAlign: "center", fontSize: 12, marginBottom: 24 },
})
