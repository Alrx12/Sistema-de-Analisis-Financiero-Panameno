/**
 * RegisterScreen — crea cuenta nueva con email + contraseña + nombre
 * Paleta navy + naranja SAFPRO (igual que login.tsx)
 */
import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from "react-native"
import { useRouter } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { register } from "@safpro/api/auth"
import { getAuthStore } from "@safpro/stores"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"
const TOKEN_KEY = "safpro_access_token"

export default function RegisterScreen() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert("Campos requeridos", "Completa todos los campos.")
      return
    }
    if (password !== confirmPassword) {
      Alert.alert("Contraseñas no coinciden", "Las contraseñas deben ser iguales.")
      return
    }
    if (password.length < 8) {
      Alert.alert("Contraseña muy corta", "Debe tener al menos 8 caracteres.")
      return
    }

    setLoading(true)
    try {
      await register(API_URL, email, password, fullName)
      Alert.alert(
        "Cuenta creada",
        "Tu cuenta fue creada exitosamente. Por favor inicia sesión.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo crear la cuenta"
      Alert.alert("Error al registrarse", msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>SAFPRO</Text>
          <Text style={styles.tagline}>Crear cuenta nueva</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Registro</Text>

          <TextInput
            style={styles.input}
            placeholder="Nombre completo"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            autoCorrect={false}
            value={fullName}
            onChangeText={setFullName}
          />

          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña (mín. 8 caracteres)"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirmar contraseña"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onSubmitEditing={handleRegister}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Crear cuenta</Text>
            }
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.registerText}>
              ¿Ya tienes cuenta?{" "}
              <Text style={styles.registerLink}>Inicia sesión</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>admin@safpro.us · Alexis Antonio Pineda Del Cid</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c2b4b",
  },
  scroll: {
    flexGrow: 1,
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
