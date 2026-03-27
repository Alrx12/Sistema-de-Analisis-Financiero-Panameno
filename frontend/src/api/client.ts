import axios from "axios"
import { useAuthStore } from "@/stores/authStore"

const apiClient = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
})

// Inyecta el JWT en cada request automáticamente
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Si el backend devuelve 401, limpia el store completo y redirige a login.
// Se ignora el endpoint de login para no interferir con errores de credenciales.
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes("/auth/login")
    if (error.response?.status === 401 && !isLoginEndpoint) {
      useAuthStore.getState().logout()
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default apiClient
