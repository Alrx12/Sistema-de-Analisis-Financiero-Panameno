/**
 * API helpers para Push Notifications.
 * Envía / borra el Expo Push Token al backend de SAFPRO.
 */
import { getApiClient } from "./index"

/**
 * Registra el push token del dispositivo en el servidor.
 * Llamar después de obtener el token con Expo Notifications.
 */
export async function savePushToken(token: string): Promise<void> {
  const client = getApiClient()
  await client.put("/users/push-token", { token })
}

/**
 * Borra el push token del servidor (ej: al cerrar sesión).
 */
export async function clearPushToken(): Promise<void> {
  const client = getApiClient()
  await client.put("/users/push-token", { token: null })
}
