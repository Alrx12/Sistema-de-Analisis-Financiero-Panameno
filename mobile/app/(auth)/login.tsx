/**
 * LoginScreen — paleta navy + naranja SAFPRO
 * Reutiliza la misma lógica de auth que el web (packages/api/auth.ts)
 */
import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { login } from "@safpro/api/auth"
import { getAuthStore } from "@safpro/stores"
import { getMe } from "@safpro/api/users"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"
const TOKEN_KEY = "safpro_access_token"

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Campos requeridos", "Ingresa tu email y contraseña.")
      return
    }
    setLoading(true)
    try {
      const res = await login(API_URL, email, password)

      if (res.requires_2fa) {
        router.push({ pathname: "/(auth)/two-factor", params: { token: res.two_factor_token } })
        return
      }

      if (!res.access_token) throw new Error("No se recibió token")

      // Guardar token en keychain y en el store
      await SecureStore.setItemAsync(TOKEN_KEY, res.access_token)
      getAuthStore().getState().setToken(res.access_token)

      // Cargar datos del usuario
      const user = await getMe()
      getAuthStore().getState().setUser(user)

      router.replace("/(tabs)/dashboard")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Credenciales incorrectas"
      Alert.alert("Error al iniciar sesión", msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header navy */}
      <View style={styles.header}>
        <Text style={styles.logo}>SAFPRO</Text>
        <Text style={styles.tagline}>Tu análisis financiero personal</Text>
      </View>

      {/* Card de login */}
      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Entrar</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")}>
          <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.registerText}>
            ¿No tienes cuenta? <Text style={styles.registerLink}>Regístrate gratis</Text>
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>admin@safpro.us · Alexis Antonio Pineda Del Cid</Text>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c2b4b",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 4,
  },
  tagline: {
    color: "#93afd4",
    marginTop: 4,
    fontSize: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1c2b4b",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
    backgroundColor: "#f9fafb",
  },
  btn: {
    backgroundColor: "#e05c19",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  link: {
    color: "#1c2b4b",
    textAlign: "center",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 16,
  },
  registerText: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 14,
  },
  registerLink: {
    color: "#e05c19",
    fontWeight: "600",
  },
  footer: {
    color: "#4e6a96",
    textAlign: "center",
    fontSize: 11,
    marginTop: 24,
  },
})
