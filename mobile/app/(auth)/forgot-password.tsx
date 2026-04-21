/**
 * ForgotPasswordScreen — solicita email y llama a /auth/forgot-password
 * Paleta navy + naranja SAFPRO (igual que login.tsx)
 */
import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import { forgotPassword } from "@safpro/api/auth"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!email) {
      Alert.alert("Campo requerido", "Ingresa tu correo electrónico.")
      return
    }
    setLoading(true)
    try {
      await forgotPassword(API_URL, email)
      setSent(true)
    } catch {
      // No revelar si el email existe o no — mensaje genérico
      setSent(true)
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
        <Text style={styles.tagline}>Recuperar contraseña</Text>
      </View>

      <View style={styles.card}>
        {sent ? (
          <>
            <Text style={styles.title}>Revisa tu correo</Text>
            <Text style={styles.description}>
              Si el email está registrado, recibirás un enlace para restablecer tu contraseña.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.btnText}>Volver al inicio de sesión</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>¿Olvidaste tu contraseña?</Text>
            <Text style={styles.description}>
              Ingresa tu correo y te enviaremos un enlace para restablecerla.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={handleSubmit}
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Enviar enlace</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>Volver al inicio de sesión</Text>
            </TouchableOpacity>
          </>
        )}
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
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
    lineHeight: 20,
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
  footer: {
    color: "#4e6a96",
    textAlign: "center",
    fontSize: 11,
    marginTop: 24,
  },
})
