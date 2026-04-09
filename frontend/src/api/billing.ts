/**
 * billing.ts — Cliente API para los endpoints de dLocal Go / billing.
 */
import apiClient from "./client"

export type BillingInterval = "monthly" | "annual"

export interface BillingStatus {
  plan: string                             // 'free' | 'pro' | 'friends_and_family'
  subscription_expires_at: string | null   // ISO-8601 o null
  has_active_subscription: boolean         // true si hay dlocalgo_subscription_id en DB
}

export interface CheckoutResponse {
  checkout_url: string
}

/**
 * Genera la URL del hosted checkout de dLocal Go para suscribirse.
 * El frontend debe redirigir al usuario a `checkout_url`.
 *
 * Tras el pago, dLocal Go notifica al backend via webhook y el plan
 * se actualiza automáticamente. El usuario regresa al success_url.
 */
export async function createCheckoutSession(
  interval: BillingInterval
): Promise<CheckoutResponse> {
  const res = await apiClient.post<CheckoutResponse>(
    "/billing/create-checkout-session",
    { interval }
  )
  return res.data
}

/**
 * Cancela la suscripción Pro activa del usuario.
 * El backend llama a la API de dLocal Go y baja el plan a 'free' inmediatamente.
 *
 * Lanza error si el usuario no tiene suscripción activa (404).
 */
export async function cancelSubscription(): Promise<void> {
  await apiClient.delete("/billing/cancel")
}

/**
 * Devuelve el estado de la suscripción del usuario autenticado.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await apiClient.get<BillingStatus>("/billing/status")
  return res.data
}
