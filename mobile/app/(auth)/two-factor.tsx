/**
 * TwoFactorScreen — verificación 2FA (TOTP 6 dígitos)
 * Se invoca desde login.tsx cuando el backend responde con requires_2fa: true
 * Paleta navy + naranja SAFPRO (igual que login.tsx)
 */
import { useState, useRef } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native"
import { useRouter, useLocalSearchParams } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { verify2FA } from "@safpro/api/auth"
import { getAuthStore } from "@safpro/stores"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"
const TOKEN_KEY = "safpro_access_token"

export default function TwoFactorScreen() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token: string }>()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<TextInput>(null)

  async function handleVerify() {
    if (!code || code.length !== 6) {
      Alert.alert("Código inválido", "Ingresa el código de 6 dígitos.")
      return
    }
    if (!token) {
      Alert.alert("Error", "Token de sesión no encontrado. Vuelve a iniciar sesión.")
      router.replace("/(auth)/login")
      return
    }

    setLoading(true)
    try {
      const res = await verify2FA(API_URL, token, code)
      if (!res.access_token) throw new Error("No se recibió token")

      await SecureStore.setItemAsync(TOKEN_KEY, res.access_token)
      getAuthStore().getState().setToken(res.access_token)

      router.replace("/(tabs)/dashboard")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Código incorrecto"
      Alert.alert("Error de verificación", msg)
      setCode("")
      inputRef.current?.focus()
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
        <Text style={styles.tagline}>Verificación en dos pasos</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Código de verificación</Text>
        <Text style={styles.description}>
          Ingresa el código de 6 dígitos de tu aplicación autenticadora.
        </Text>

        <TextInput
          ref={inputRef}
          style={styles.codeInput}
          placeholder="000000"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={handleVerify}
          autoFocus
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.btn, (loading || code.length !== 6) && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Verificar</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.link}>Volver al inicio de sesión</Text>
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
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 20,
  },
  codeInput: {
    borderWidth: 2,
    borderColor: "#1c2b4b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
    backgroundColor: "#f9fafb",
    letterSpacing: 8,
  },
  btn: {
    backgroundColor: "#e05c19",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.5,
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
