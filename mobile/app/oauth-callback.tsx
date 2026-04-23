/**
 * OAuthCallbackScreen — Deep link handler para OAuth mobile
 *
 * Activado por: safpro://oauth-callback?token=<JWT>
 * (El backend redirige aquí cuando el state JWT tiene mobile=true)
 *
 * Guarda el token en SecureStore + authStore y navega al Dashboard.
 */
import { useEffect } from "react"
import { View, Text, ActivityIndicator, StyleSheet, Alert } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { getAuthStore } from "@safpro/stores"
import { useQueryClient } from "@tanstack/react-query"

const TOKEN_KEY = "safpro_access_token"
const INDIGO    = "#6366f1"
const BG        = "#070c18"
const MUTED     = "rgba(255,255,255,0.45)"
const TEXT      = "#f1f5f9"

export default function OAuthCallbackScreen() {
  const router       = useRouter()
  const queryClient  = useQueryClient()
  const { token }    = useLocalSearchParams<{ token?: string }>()

  useEffect(() => {
    if (!token) {
      Alert.alert(
        "Error de autenticación",
        "No se recibió token del proveedor OAuth.",
        [{ text: "Volver al inicio", onPress: () => router.replace("/(auth)/login") }],
      )
      return
    }

    ;(async () => {
      try {
        // 1. Guardar en keychain
        await SecureStore.setItemAsync(TOKEN_KEY, token)

        // 2. Actualizar el store en memoria
        getAuthStore().getState().setToken(token)

        // 3. Invalidar el query de usuario para que cargue fresco
        await queryClient.invalidateQueries({ queryKey: ["me"] })

        // 4. Navegar al dashboard
        router.replace("/(tabs)/dashboard")
      } catch (err) {
        Alert.alert(
          "Error",
          "No se pudo completar el inicio de sesión. Intenta de nuevo.",
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }],
        )
      }
    })()
  }, [token])

  return (
    <View style={s.container}>
      <ActivityIndicator color={INDIGO} size="large" />
      <Text style={s.text}>Completando inicio de sesión…</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  text: {
    color: MUTED,
    fontSize: 15,
  },
})
