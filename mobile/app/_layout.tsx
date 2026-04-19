/**
 * Root Layout — Expo Router
 * Inicializa: API client, Auth store, TanStack Query
 */
import React from "react"
import { View, Text, ScrollView } from "react-native"
import { Stack } from "expo-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { createApiClient } from "@safpro/api"
import { initAuthStore, getAuthStore } from "@safpro/stores"

// ── Error Boundary — muestra el crash en pantalla en vez de quedarse azul ────

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

// ── Inicializar una sola vez ─────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,   // 2 minutos
      retry: 1,
    },
  },
})

const TOKEN_KEY = "safpro_access_token"

// Storage adapter usando expo-secure-store (keychain del dispositivo)
const secureStorage = {
  getItem: async (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: async (key: string) => SecureStore.deleteItemAsync(key),
}

// Inicializar auth store con secure storage
initAuthStore(secureStorage)

// Inicializar cliente API
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"

createApiClient({
  baseURL: API_URL,
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  onUnauthorized: () => {
    getAuthStore().getState().logout()
  },
})

// ── Root Layout Component ────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
