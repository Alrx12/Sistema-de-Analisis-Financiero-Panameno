/**
 * ResetPasswordScreen — recibe token via deep link safpro://reset-password?token=xxx
 * o desde el email de recuperación. Paleta navy + naranja SAFPRO.
 */
import { useState, useEffect } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from "react-native"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { resetPassword } from "@safpro/api/auth"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"

export default function ResetPasswordScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string }>()
  const token = params.token ?? ""

  const [password, setPassword]       = useState("")
  const [confirm, setConfirm]         = useState("")
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [done, setDone]               = useState(false)

  async function handleSubmit() {
    if (!password || !confirm) {
      Alert.alert("Campos requeridos", "Completa ambos campos.")
      return
    }
    if (password.length < 8) {
      Alert.alert("Contraseña muy corta", "Debe tener al menos 8 caracteres.")
      return
    }
    if (password !== confirm) {
      Alert.alert("No coinciden", "Las contraseñas deben ser iguales.")
      return
    }
    if (!token) {
      Alert.alert("Token inválido", "El enlace de recuperación es inválido o expiró. Solicita uno nuevo.")
      return
    }

    setLoading(true)
    try {
      await resetPassword(API_URL, token, password)
      setDone(true)
      setTimeout(() => router.replace("/(auth)/login"), 2500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Token inválido o expirado"
      Alert.alert("Error", msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>SAFPRO</Text>
        <Text style={styles.tagline}>Nueva contraseña</Text>
      </View>

      <View style={styles.card}>
        {!token && !done && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#dc2626" />
            <Text style={styles.errorBannerText}>
              Enlace inválido. Verifica el link en tu correo.
            </Text>
          </View>
        )}

        {done ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle-outline" size={24} color="#16a34a" />
            <View>
              <Text style={styles.successTitle}>¡Contraseña actualizada!</Text>
              <Text style={styles.successSub}>Redirigiendo al login…</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Elige una nueva contraseña</Text>
            <Text style={styles.description}>
              Debe tener al menos 8 caracteres.
            </Text>

            {/* Nueva contraseña */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Nueva contraseña"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(v => !v)}>
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* Confirmar */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Confirmar contraseña"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showConfirm}
                value={confirm}
                onChangeText={setConfirm}
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, (loading || !token) && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading || !token}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Guardar nueva contraseña</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={{ marginTop: 12 }} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.link}>← Volver al inicio de sesión</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>admin@safpro.us · Alexis Antonio Pineda Del Cid</Text>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#1c2b4b",
    justifyContent: "center", padding: 24,
  },
  header: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: "800", color: "#ffffff", letterSpacing: 4 },
  tagline: { color: "#93afd4", marginTop: 4, fontSize: 14 },
  card: {
    backgroundColor: "#ffffff", borderRadius: 20, padding: 28,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  title:       { fontSize: 22, fontWeight: "700", color: "#1c2b4b", marginBottom: 6 },
  description: { fontSize: 14, color: "#6b7280", marginBottom: 20 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    backgroundColor: "#f9fafb", marginBottom: 12,
  },
  input: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: "#111827",
  },
  eyeBtn: { paddingHorizontal: 12 },
  btn: {
    backgroundColor: "#e05c19", borderRadius: 10,
    paddingVertical: 14, alignItems: "center", marginTop: 4, marginBottom: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  link: { color: "#1c2b4b", textAlign: "center", fontSize: 13, textDecorationLine: "underline" },
  footer: { color: "#4e6a96", textAlign: "center", fontSize: 11, marginTop: 24 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 8, padding: 10, marginBottom: 16,
  },
  errorBannerText: { color: "#dc2626", fontSize: 13, flex: 1 },
  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0",
    borderRadius: 12, padding: 16,
  },
  successTitle: { fontSize: 15, fontWeight: "700", color: "#15803d" },
  successSub:   { fontSize: 13, color: "#16a34a", marginTop: 2 },
})
