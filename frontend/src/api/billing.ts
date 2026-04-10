/**
 * billing.ts — Cliente API para los endpoints de pagos y suscripciones.
 *
 * Procesadores soportados (detección automática en el backend):
 *   Plan A: PayPal Subscriptions
 *   Plan B: dLocal Go
 */
import apiClient from "./client"

export type BillingInterval = "monthly" | "annual"
export type BillingProcessor = "paypal" | "dlocalgo" | null

export interface BillingStatus {
  plan: string                             // 'free' | 'pro' | 'friends_and_family'
  subscription_expires_at: string | null   // ISO-8601 o null
  has_active_subscription: boolean         // true si hay subscription_id activo en DB
  processor: BillingProcessor              // procesador activo del usuario ('paypal' | 'dlocalgo' | null)
}

export interface CheckoutResponse {
  checkout_url: string
  processor: BillingProcessor              // procesador usado para este checkout
}

/**
 * Genera la URL del hosted checkout del procesador activo (PayPal o dLocal Go).
 * El frontend debe redirigir al usuario a `checkout_url`.
 *
 * Tras el pago, el procesador notifica al backend via webhook y el plan
 * se actualiza automáticamente.
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
 * El backend detecta automáticamente el procesador (PayPal o dLocal Go) y cancela.
 * Baja el plan a 'free' inmediatamente.
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
