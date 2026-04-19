/**
 * Auth Store compartido — web y mobile.
 *
 * La diferencia clave es cómo se persiste el token:
 * - Web: localStorage (ya integrado en el store web existente)
 * - Mobile: expo-secure-store (keychain del dispositivo)
 *
 * Este store NO importa nada específico de plataforma.
 * Cada app configura su propio storage al inicializar.
 *
 * Uso en mobile (App.tsx):
 *   import { useAuthStore } from "@safpro/stores"
 *   // el store usa el storageAdapter que se inyecta una vez
 */
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { User } from "@safpro/types"

// Adaptador de storage que cada plataforma provee
// Web: localStorage / Mobile: AsyncStorage-compatible
export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null
  setItem: (key: string, value: string) => Promise<void> | void
  removeItem: (key: string) => Promise<void> | void
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

// Store base sin persistencia — la persistencia se agrega en cada app
export const createAuthStore = (storage?: StorageAdapter) => {
  const storeFactory = (set: (partial: Partial<AuthState>) => void) => ({
    token: null as string | null,
    user: null as User | null,
    isAuthenticated: false,

    setToken: (token: string) => {
      set({ token, isAuthenticated: true })
    },

    setUser: (user: User) => set({ user }),

    logout: () => {
      set({ token: null, user: null, isAuthenticated: false })
    },
  })

  if (!storage) {
    return create<AuthState>()(storeFactory)
  }

  return create<AuthState>()(
    persist(storeFactory, {
      name: "safpro-auth",
      storage: createJSONStorage(() => ({
        getItem: async (key: string) => {
          const val = await storage.getItem(key)
          return val ?? null
        },
        setItem: async (key: string, value: string) => {
          await storage.setItem(key, value)
        },
        removeItem: async (key: string) => {
          await storage.removeItem(key)
        },
      })),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true
        }
      },
    })
  )
}

// Instancia singleton — se reemplaza por cada plataforma al iniciar
let _store: ReturnType<typeof createAuthStore> | null = null

export function initAuthStore(storage?: StorageAdapter) {
  _store = createAuthStore(storage)
  return _store
}

export function getAuthStore() {
  if (!_store) {
    throw new Error("[SAFPRO] Auth store not initialized. Call initAuthStore() at app startup.")
  }
  return _store
}

// Hook de conveniencia — funciona igual que useAuthStore en el frontend actual
export function useAuthStore() {
  return getAuthStore()()
}
