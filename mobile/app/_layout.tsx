/**
 * Root Layout — Expo Router
 * Inicializa: API client, Auth store, TanStack Query
 */
import "../global.css"
import { useEffect } from "react"
import { Stack } from "expo-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SecureStore from "expo-secure-store"
import { createApiClient } from "@safpro/api"
import { initAuthStore, getAuthStore } from "@safpro/stores"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,   // 2 minutos
      retry: 1,
    },
  },
})

// ── Inicializar una sola vez ─────────────────────────────────────────────────

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
    // Limpiar sesión y redirigir a login
    getAuthStore().getState().logout()
    // expo-router maneja la redirección automáticamente vía el guard de auth
  },
})

// ── Root Layout Component ────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  )
}
