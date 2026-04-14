/**
 * Cliente Axios compartido — web y mobile.
 *
 * Diferencias con el cliente web:
 * - baseURL se toma de la variable de entorno EXPO_PUBLIC_API_URL (mobile)
 *   o del proxy de Vite "/api/v1" (web).
 * - El token se inyecta mediante un callback getToken() que cada plataforma
 *   provee (web → localStorage, mobile → expo-secure-store).
 * - El callback onUnauthorized() permite al mobile navegar a Login sin
 *   depender de window.location.href.
 */
import axios, { type AxiosInstance } from "axios"

let _client: AxiosInstance | null = null

interface ClientConfig {
  /** URL base de la API. Web: "/api/v1" — Mobile: "https://safpro.us/api/v1" */
  baseURL: string
  /** Función que devuelve el JWT guardado (async para compatibilidad con SecureStore) */
  getToken: () => Promise<string | null> | string | null
  /** Callback cuando el backend devuelve 401 (sesión expirada) */
  onUnauthorized: () => void
}

export function createApiClient(config: ClientConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseURL,
    headers: { "Content-Type": "application/json" },
  })

  // Inyecta el JWT en cada request
  client.interceptors.request.use(async (reqConfig) => {
    const token = await config.getToken()
    if (token) {
      reqConfig.headers.Authorization = `Bearer ${token}`
    }
    return reqConfig
  })

  // Maneja 401: limpia sesión y redirige a login
  client.interceptors.response.use(
    (res) => res,
    (error) => {
      const isLoginEndpoint = error.config?.url?.includes("/auth/login")
      if (error.response?.status === 401 && !isLoginEndpoint) {
        config.onUnauthorized()
      }
      return Promise.reject(error)
    }
  )

  _client = client
  return client
}

/** Obtiene el cliente ya inicializado. Lanza error si no fue configurado. */
export function getApiClient(): AxiosInstance {
  if (!_client) {
    throw new Error(
      "[SAFPRO] API client not initialized. Call createApiClient() at app startup."
    )
  }
  return _client
}
