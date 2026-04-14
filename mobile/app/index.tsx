/**
 * Punto de entrada — redirige según estado de autenticación
 */
import { Redirect } from "expo-router"
import { getAuthStore } from "@safpro/stores"

export default function Index() {
  const { isAuthenticated } = getAuthStore()()
  return <Redirect href={isAuthenticated ? "/(tabs)/dashboard" : "/(auth)/login"} />
}
