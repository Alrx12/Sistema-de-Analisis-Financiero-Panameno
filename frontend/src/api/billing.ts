/**
 * billing.ts — Cliente API para los endpoints de Stripe / billing.
 */
import apiClient from "./client"

export type BillingInterval = "monthly" | "annual"

export interface BillingStatus {
  plan: string                        // 'free' | 'pro' | 'friends_and_family'
  subscription_expires_at: string | null  // ISO-8601 o null
  has_stripe_customer: boolean
}

export interface CheckoutResponse {
  checkout_url: string
}

export interface PortalResponse {
  portal_url: string
}

/**
 * Crea una sesión de Stripe Checkout.
 * El usuario debe ser redirigido a `checkout_url` para completar el pago.
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
 * Genera una URL del Customer Portal de Stripe para gestionar la suscripción.
 */
export async function getPortalUrl(): Promise<PortalResponse> {
  const res = await apiClient.get<PortalResponse>("/billing/portal")
  return res.data
}

/**
 * Devuelve el estado de la suscripción del usuario autenticado.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await apiClient.get<BillingStatus>("/billing/status")
  return res.data
}
