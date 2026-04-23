/**
 * Root Layout — Expo Router
 * Inicializa: API client, Auth store, TanStack Query,
 *             Push Notifications, Animated Splash Screen
 */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Dimensions, Image, Platform, StyleSheet, Text, View, ScrollView } from "react-native"
import { Stack } from "expo-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import * as SplashScreen from "expo-splash-screen"
import * as Notifications from "expo-notifications"
import { createApiClient } from "@safpro/api"
import { initAuthStore, getAuthStore } from "@safpro/stores"
import { savePushToken } from "@safpro/api/notifications"

// Mantener el splash nativo visible mientras carga
SplashScreen.preventAutoHideAsync().catch(() => {})

// ── Configuración de notificaciones ─────────────────────────────────────────
// Cómo mostrar notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// ── Error Boundary ────────────────────────────────────────────────────────────
interface EBState { error: Error | null }

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  EBState
> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingTop: 60 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#c00", marginBottom: 12 }}>
            ⚠️ Error al cargar la app
          </Text>
          <ScrollView>
            <Text style={{ fontSize: 14, color: "#333", marginBottom: 8 }}>
              {this.state.error.message}
            </Text>
            <Text style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      )
    }
    return this.props.children
  }
}

// ── Query Client ─────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutos
      retry: 1,
    },
  },
})

const TOKEN_KEY = "safpro_access_token"

const secureStorage = {
  getItem: async (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: async (key: string) => SecureStore.deleteItemAsync(key),
}

initAuthStore(secureStorage)

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"

createApiClient({
  baseURL: API_URL,
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  onUnauthorized: () => {
    getAuthStore().getState().logout()
  },
})

// ── Animated Splash Screen ────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window")
const LOGO_SIZE = Math.round(SCREEN_W * 0.35)

function AnimatedSplashOverlay({ onDone }: { onDone: () => void }) {
  const opacity  = useRef(new Animated.Value(1)).current
  const scale    = useRef(new Animated.Value(0.88)).current
  const fadeOut  = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // 1. Logo aparece — fade in + scale up
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start(() => {
      // 2. Breve pausa, luego fade out del overlay completo
      setTimeout(() => {
        Animated.timing(fadeOut, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }).start(onDone)
      }, 500)
    })
  }, [])

  return (
    <Animated.View style={[splashStyles.overlay, { opacity: fadeOut }]}>
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: "center" }}>
        {/* Logo SAFPRO — degradado navy con ícono */}
        <View style={splashStyles.logoBox}>
          <Text style={splashStyles.logoText}>SAFPRO</Text>
          <Text style={splashStyles.logoSub}>FINANCIAL AI</Text>
        </View>
        {/* Barra de acento naranja */}
        <View style={splashStyles.accent} />
        <Text style={splashStyles.tagline}>Análisis Financiero Inteligente</Text>
      </Animated.View>
    </Animated.View>
  )
}

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#070c18",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE * 0.22,
    backgroundColor: "#0d1426",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  logoText: {
    color: "#f1f5f9",
    fontSize: Math.round(LOGO_SIZE * 0.18),
    fontWeight: "900",
    letterSpacing: 4,
  },
  logoSub: {
    color: "rgba(165,180,252,0.7)",
    fontSize: Math.round(LOGO_SIZE * 0.07),
    fontWeight: "600",
    letterSpacing: 3,
    marginTop: 4,
  },
  accent: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#e05c19",
    marginTop: 20,
    marginBottom: 12,
  },
  tagline: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
})

// ── Push Notification setup ───────────────────────────────────────────────────
async function registerForPushNotifications(): Promise<string | null> {
  // Solo disponible en dispositivos físicos (no simuladores)
  if (!Notifications.isDevicePushTokenAvailable) {
    return null
  }

  // Verificar / solicitar permiso
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== "granted") {
    return null
  }

  // Obtener el token de Expo
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "59794fe6-4cfa-4446-b9d7-28a401e17185", // del app.json extra.eas.projectId
    })
    return tokenData.data
  } catch {
    return null
  }
}

// ── Root Layout Component ────────────────────────────────────────────────────
export default function RootLayout() {
  const [appReady,      setAppReady]      = useState(false)
  const [splashDone,    setSplashDone]    = useState(false)
  const notifListenerRef  = useRef<Notifications.Subscription | null>(null)
  const responseListenerRef = useRef<Notifications.Subscription | null>(null)

  // Preparar la app: ocultar splash nativo, registrar notificaciones
  const prepare = useCallback(async () => {
    try {
      // Ocultar el splash nativo — nuestra overlay animada tomará el relevo
      await SplashScreen.hideAsync()
    } catch { /* ignorar */ }

    try {
      // Registrar push notifications si el usuario ya tiene token guardado
      const authToken = await SecureStore.getItemAsync(TOKEN_KEY)
      if (authToken) {
        const pushToken = await registerForPushNotifications()
        if (pushToken) {
          // Fire-and-forget: enviar al backend (puede fallar si el server está caído)
          savePushToken(pushToken).catch(() => {})
        }
      }
    } catch { /* no bloquear el arranque */ }

    setAppReady(true)
  }, [])

  useEffect(() => {
    prepare()

    // Listener: notificación recibida con la app abierta
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      // La notificación se muestra automáticamente (setNotificationHandler arriba)
      // Aquí podríamos invalidar queries si el tipo es job_completed
      const data = notification.request.content.data as any
      if (data?.type === "job_completed" || data?.type === "job_failed") {
        queryClient.invalidateQueries({ queryKey: ["jobs"] })
        queryClient.invalidateQueries({ queryKey: ["analysis"] })
      }
    })

    // Listener: usuario tocó la notificación → podría navegar a una pantalla
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Navegación avanzada se puede agregar aquí si se necesita
      // Por ahora solo refrescamos las queries de análisis
      queryClient.invalidateQueries({ queryKey: ["analysis"] })
    })

    return () => {
      notifListenerRef.current?.remove()
      responseListenerRef.current?.remove()
    }
  }, [prepare])

  // Mientras no esté listo, no mostrar nada (el splash nativo está visible)
  if (!appReady) return null

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Stack principal */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)"       options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)"       options={{ headerShown: false }} />
          <Stack.Screen name="onboarding"   options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
          <Stack.Screen name="upgrade"         options={{ headerShown: false }} />
          <Stack.Screen name="payment-success" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="contacto"        options={{ headerShown: false }} />
          <Stack.Screen name="faq"             options={{ headerShown: false }} />
          <Stack.Screen name="privacy"         options={{ headerShown: false }} />
          <Stack.Screen name="terms"           options={{ headerShown: false }} />
          <Stack.Screen name="2fa-setup"       options={{ headerShown: false }} />
          <Stack.Screen name="oauth-callback"  options={{ headerShown: false }} />
        </Stack>

        {/* Overlay animada del splash — se muestra encima hasta completar la animación */}
        {!splashDone && (
          <AnimatedSplashOverlay onDone={() => setSplashDone(true)} />
        )}
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
